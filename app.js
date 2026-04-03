/* ============================================================
   Pricing Game - 收益管理模擬遊戲
   ============================================================ */

(function () {
    'use strict';

    const state = {
        config: {
            numStudents: 40,
            numGroups: 8,
            numCustomers: 20,
            repricingInterval: 5,
            supplyLimit: 7,
            productName: '旅遊行程',
            drawMode: 'auto',
        },
        wtpPrices: [],
        rounds: {},
        currentStep: 'setup',
    };

    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

    // Thousands separator formatter
    function fmt(n) {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('en-US');
    }

    // ───── Server Module (QR code mobile input) ─────
    const server = {
        available: false,
        baseUrl: '',
        mobileUrl: '',
        _pollingTimer: null,

        async detect() {
            try {
                const res = await fetch('/api/ip', { signal: AbortSignal.timeout(2000) });
                const data = await res.json();
                this.available = true;
                this.baseUrl = `http://${data.ip}:${data.port}`;
                this.mobileUrl = `${this.baseUrl}/mobile.html`;
                return true;
            } catch (e) {
                this.available = false;
                return false;
            }
        },

        async notifyRound(round, segment, roundName, numGroups) {
            if (!this.available) return;
            try {
                await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ round, segment, roundName, numGroups }),
                });
            } catch (e) {}
        },

        async fetchPrices(round, segment) {
            if (!this.available) return null;
            try {
                const res = await fetch(`/api/prices?round=${round}&segment=${segment}`);
                return await res.json();
            } catch (e) { return null; }
        },

        startPolling(round, segment, numGroups, onUpdate) {
            this.stopPolling();
            this._pollingTimer = setInterval(async () => {
                const data = await this.fetchPrices(round, segment);
                if (data) onUpdate(data.prices, data.locked);
            }, 2000);
        },

        stopPolling() {
            if (this._pollingTimer) {
                clearInterval(this._pollingTimer);
                this._pollingTimer = null;
            }
        },

        getQRImageUrl(url) {
            return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
        },

        buildQRSection(roundNum, segment, numGroups, roundName) {
            const url = this.mobileUrl;
            let chips = '';
            for (let g = 1; g <= numGroups; g++) {
                chips += `<span class="status-chip" id="qr-chip-${roundNum}-${segment}-${g}">第${g}組</span>`;
            }
            return `
            <div class="qr-section" id="r${roundNum}-qr-section">
                <h3>各組代表請掃描 QR Code 輸入定價</h3>
                <div class="qr-display">
                    <img class="qr-img" src="${this.getQRImageUrl(url)}" alt="QR Code">
                    <div class="qr-info">
                        <div style="font-weight:600;font-size:.95rem;margin-bottom:.3rem">${roundName}</div>
                        <div style="font-size:.85rem;color:var(--gray-500)">掃描後選擇組別並輸入定價</div>
                        <div class="qr-url">${url}</div>
                        <div class="submit-status">
                            <div style="font-size:.8rem;color:var(--gray-500);margin-bottom:.3rem">送出狀態：</div>
                            <div class="submit-status-grid">${chips}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        },
    };

    function showStep(name) {
        $$('.step').forEach(s => s.classList.remove('active'));
        const el = $(`#step-${name}`);
        if (el) el.classList.add('active');
        state.currentStep = name;
        updateNav();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateNav() {
        const nav = $('#nav-bar');
        nav.classList.remove('hidden');
        $$('.nav-btn').forEach(btn => {
            btn.classList.remove('current');
            if (btn.dataset.step === state.currentStep) btn.classList.add('current');
        });
    }

    // ───── SETUP ─────
    function initSetup() {
        const calc = () => {
            const s = +$('#numStudents').value || 1;
            const g = +$('#numGroups').value || 1;
            $('#studentsPerGroup').textContent = Math.floor(s / g);
        };
        $('#numStudents').addEventListener('input', calc);
        $('#numGroups').addEventListener('input', calc);

        $('#btn-start-game').addEventListener('click', () => {
            state.config.numStudents = +$('#numStudents').value;
            state.config.numGroups = +$('#numGroups').value;
            state.config.numCustomers = +$('#numCustomers').value;
            state.config.repricingInterval = +$('#repricingInterval').value;
            state.config.supplyLimit = +$('#supplyLimit').value;
            state.config.productName = $('#productName').value || '產品';
            state.config.drawMode = document.querySelector('input[name="drawMode"]:checked').value;
            initWTP();
            showStep('wtp');
        });
    }

    // ───── WTP COLLECTION ─────
    function initWTP() {
        $('#wtp-product-name').textContent = state.config.productName;
        $('#wtp-total').textContent = state.config.numStudents;
        state.wtpPrices = [];
        renderWTPTags();

        const input = $('#wtp-input');
        const addOne = () => {
            const v = parseFloat(input.value);
            if (isNaN(v) || v < 0) return;
            state.wtpPrices.push(v);
            input.value = '';
            input.focus();
            renderWTPTags();
        };
        $('#btn-add-wtp').onclick = addOne;
        input.onkeydown = e => { if (e.key === 'Enter') addOne(); };

        $('#btn-bulk-wtp').onclick = () => {
            const raw = $('#wtp-bulk').value;
            const nums = raw.split(/[\s,;\n]+/).map(Number).filter(n => !isNaN(n) && n >= 0);
            state.wtpPrices.push(...nums);
            $('#wtp-bulk').value = '';
            renderWTPTags();
        };

        $('#btn-random-wtp').onclick = () => {
            const need = state.config.numStudents - state.wtpPrices.length;
            if (need <= 0) return;
            for (let i = 0; i < need; i++) {
                state.wtpPrices.push(Math.round(50 + Math.random() * 450));
            }
            renderWTPTags();
        };

        $('#btn-wtp-done').onclick = () => {
            initRound(1);
            showStep('round1');
        };
    }

    function renderWTPTags() {
        const container = $('#wtp-tags');
        container.innerHTML = '';
        state.wtpPrices.forEach((p, i) => {
            const tag = document.createElement('span');
            tag.className = 'wtp-tag';
            tag.innerHTML = `$${fmt(p)} <span class="remove" data-idx="${i}">&times;</span>`;
            container.appendChild(tag);
        });
        container.querySelectorAll('.remove').forEach(btn => {
            btn.onclick = () => {
                state.wtpPrices.splice(+btn.dataset.idx, 1);
                renderWTPTags();
            };
        });
        const n = state.wtpPrices.length;
        const total = state.config.numStudents;
        $('#wtp-count').textContent = n;
        const pct = Math.min(100, (n / total) * 100);
        $('#wtp-progress-fill').style.width = pct + '%';
        $('#btn-wtp-done').disabled = n < 2;
    }

    // ───── ROUND LOGIC ─────
    function initRound(roundNum) {
        const { numGroups, numCustomers, repricingInterval, supplyLimit, drawMode } = state.config;
        const container = $(`.round-container[data-round="${roundNum}"]`);
        const canReprice = roundNum >= 3;
        const hasSupply = roundNum === 4;

        const roundData = {
            groupPrices: {},
            draws: [],
            results: [],
            drawIndex: 0,
            currentSegment: 0,
            allDrawn: false,
            paused: false,          // for repricing pause
            pendingWtp: null,       // WTP waiting to be processed after reprice
        };
        state.rounds[roundNum] = roundData;

        const numSegments = canReprice ? Math.ceil(numCustomers / repricingInterval) : 1;

        const roundNames = { 1: '第一輪', 2: '第二輪', 3: '第三輪', 4: '第四輪（決勝輪）' };
        let descText = '';
        if (roundNum === 1) descText = '各組設定售價後，隨機抽取顧客的願付價格。若願付價格 ≥ 組別定價，即為成交。';
        else if (roundNum === 2) descText = '根據第一輪的結果與市場價格，各組重新定價。將重新抽取一組新的顧客。';
        else if (roundNum === 3) descText = `與第二輪相似，但每抽取 ${repricingInterval} 位顧客後可重新定價。本輪共有 ${numSegments} 次定價機會。`;
        else descText = `決勝輪！規則同第三輪，但每組僅有 ${supplyLimit} 個產品庫存。售完即止，無法再成交。`;

        const isManual = drawMode === 'manual';
        const drawModeLabel = isManual ? '手動輸入模式' : '自動抽籤模式';

        let html = `
        <div class="card">
            <div class="round-header">
                <h2>${roundNames[roundNum]}</h2>
                <div>
                    <span class="round-badge ${roundNum === 4 ? 'badge-danger' : 'badge-info'}">
                        ${hasSupply ? `庫存：${supplyLimit} 個` : `${numCustomers} 位顧客`}
                    </span>
                    <span class="round-badge badge-warning">${drawModeLabel}</span>
                </div>
            </div>
            <div class="round-description">${descText}</div>
            <div id="r${roundNum}-pricing-section">
                <h3 style="margin-bottom:.75rem">各組定價 ${canReprice ? '（第 1 段）' : ''}</h3>
                <div class="pricing-input-grid" id="r${roundNum}-pricing-grid"></div>
                <div style="display:flex;gap:.75rem;flex-wrap:wrap">
                    <button class="btn btn-primary" id="r${roundNum}-submit-prices">鎖定價格並開始抽籤</button>
                    <button class="btn btn-outline" id="r${roundNum}-random-prices">隨機填入定價（QC 測試用）</button>
                </div>
                <div id="r${roundNum}-qr-area"></div>
            </div>
            <div id="r${roundNum}-game-area" class="hidden">
                <div class="draw-controls" id="r${roundNum}-draw-controls">
                    ${isManual ? `
                        <div class="manual-draw-area">
                            <input type="number" id="r${roundNum}-manual-input" placeholder="輸入抽出的價格" min="0" step="any">
                            <button class="btn btn-warning" id="r${roundNum}-manual-draw">確認此顧客</button>
                        </div>
                    ` : `
                        <button class="btn btn-primary" id="r${roundNum}-draw-one">抽取下一位顧客</button>
                        <button class="btn btn-secondary" id="r${roundNum}-draw-all">自動抽完全部</button>
                    `}
                    <span class="draw-status" id="r${roundNum}-draw-status">已抽取 0 / ${numCustomers} 位</span>
                </div>
                <div id="r${roundNum}-reprice-banner"></div>
                <div class="round-table-wrap">
                    <table class="round-table" id="r${roundNum}-table">
                        <thead id="r${roundNum}-thead"></thead>
                        <tbody id="r${roundNum}-tbody"></tbody>
                    </table>
                </div>
            </div>
            <div id="r${roundNum}-summary" class="hidden"></div>
            <div class="round-nav">
                ${roundNum > 1 ? `<button class="btn btn-secondary" id="r${roundNum}-prev">返回${roundNames[roundNum - 1] || ''}</button>` : '<span></span>'}
                <button class="btn btn-success btn-lg hidden" id="r${roundNum}-next">${roundNum < 4 ? `進入${roundNames[roundNum + 1] || ''}` : '查看最終結果'}</button>
            </div>
        </div>`;
        container.innerHTML = html;

        // Build pricing inputs
        const pricingGrid = $(`#r${roundNum}-pricing-grid`);
        for (let g = 0; g < numGroups; g++) {
            const div = document.createElement('div');
            div.className = 'pricing-input-card';
            div.innerHTML = `<label>第 ${g + 1} 組</label><input type="number" id="r${roundNum}-gp-${g}" min="0" step="any" placeholder="定價">`;
            pricingGrid.appendChild(div);
        }

        // Build table header
        const thead = $(`#r${roundNum}-thead`);
        let hRow = '<tr><th>#</th><th>願付價格</th>';
        for (let g = 0; g < numGroups; g++) hRow += `<th class="group-header">第 ${g + 1} 組</th>`;
        hRow += '</tr>';
        thead.innerHTML = hRow;

        // State per group
        const groupState = [];
        for (let g = 0; g < numGroups; g++) {
            groupState.push({ deals: 0, revenue: 0, soldOut: false, soldCount: 0 });
        }

        // Prepare WTP pool for auto mode
        let wtpPool = [...state.wtpPrices];
        shuffle(wtpPool);
        wtpPool = wtpPool.slice(0, numCustomers);

        // Random price fill (QC testing)
        $(`#r${roundNum}-random-prices`).onclick = () => {
            const allWtp = state.wtpPrices;
            const lo = Math.min(...allWtp);
            const hi = Math.max(...allWtp);
            const rangeLo = Math.floor(lo * 0.9);
            const rangeHi = Math.ceil(hi * 1.1);
            for (let g = 0; g < numGroups; g++) {
                const input = $(`#r${roundNum}-gp-${g}`);
                if (input && !input.disabled) {
                    input.value = Math.round(rangeLo + Math.random() * (rangeHi - rangeLo));
                }
            }
        };

        // QR Code mobile input (if server available)
        if (server.available) {
            const seg0 = roundData.currentSegment;
            const rName = roundNames[roundNum] + (canReprice ? '（第 1 段）' : '');
            server.notifyRound(roundNum, seg0, rName, numGroups);
            $(`#r${roundNum}-qr-area`).innerHTML = server.buildQRSection(roundNum, seg0, numGroups, rName);

            server.startPolling(roundNum, seg0, numGroups, (prices, locked) => {
                let allDone = true;
                for (let g = 1; g <= numGroups; g++) {
                    const chip = $(`#qr-chip-${roundNum}-${seg0}-${g}`);
                    if (locked[g]) {
                        if (chip) chip.classList.add('submitted');
                        const input = $(`#r${roundNum}-gp-${g - 1}`);
                        if (input && !input.disabled) {
                            input.value = prices[g];
                            input.closest('.pricing-input-card').classList.add('submitted');
                        }
                    } else {
                        allDone = false;
                    }
                }
            });
        }

        // Submit prices
        $(`#r${roundNum}-submit-prices`).onclick = () => {
            server.stopPolling();
            const seg = roundData.currentSegment;
            const prices = {};
            let valid = true;
            for (let g = 0; g < numGroups; g++) {
                const v = parseFloat($(`#r${roundNum}-gp-${g}`).value);
                if (isNaN(v) || v < 0) { valid = false; break; }
                prices[g] = v;
            }
            if (!valid) { alert('請為每一組輸入有效的定價。'); return; }
            roundData.groupPrices[seg] = prices;

            for (let g = 0; g < numGroups; g++) {
                $(`#r${roundNum}-gp-${g}`).disabled = true;
                $(`#r${roundNum}-gp-${g}`).closest('.pricing-input-card').classList.add('submitted');
            }
            $(`#r${roundNum}-submit-prices`).classList.add('hidden');
            addPricingRow(roundNum, seg, prices, false);
            $(`#r${roundNum}-game-area`).classList.remove('hidden');

            if (isManual) {
                const mi = $(`#r${roundNum}-manual-input`);
                if (mi) mi.focus();
            }
        };

        // Draw handlers
        if (isManual) {
            const manualConfirm = () => {
                const rd = state.rounds[roundNum];
                if (rd.paused) return; // blocked during reprice pause
                const mi = $(`#r${roundNum}-manual-input`);
                const v = parseFloat(mi.value);
                if (isNaN(v) || v < 0) { alert('請輸入有效的顧客願付價格。'); return; }
                mi.value = '';
                mi.focus();
                processCustomer(roundNum, v, groupState, numSegments, wtpPool);
            };
            setTimeout(() => {
                const btn = $(`#r${roundNum}-manual-draw`);
                const input = $(`#r${roundNum}-manual-input`);
                if (btn) btn.onclick = manualConfirm;
                if (input) input.onkeydown = e => { if (e.key === 'Enter') manualConfirm(); };
            }, 0);
        } else {
            $(`#r${roundNum}-draw-one`).onclick = () => {
                const rd = state.rounds[roundNum];
                if (rd.paused || rd.allDrawn || rd.drawIndex >= numCustomers) return;
                const wtp = wtpPool[rd.drawIndex];
                processCustomer(roundNum, wtp, groupState, numSegments, wtpPool);
            };
            $(`#r${roundNum}-draw-all`).onclick = () => {
                const delay = 150;
                const interval = setInterval(() => {
                    const rd = state.rounds[roundNum];
                    if (rd.allDrawn || rd.paused) { clearInterval(interval); return; }
                    if (rd.drawIndex >= numCustomers) { clearInterval(interval); return; }
                    const wtp = wtpPool[rd.drawIndex];
                    processCustomer(roundNum, wtp, groupState, numSegments, wtpPool);
                }, delay);
            };
        }

        // Navigation
        if (roundNum > 1) {
            $(`#r${roundNum}-prev`).onclick = () => showStep(`round${roundNum - 1}`);
        }
        $(`#r${roundNum}-next`).onclick = () => {
            if (roundNum < 4) {
                initRound(roundNum + 1);
                showStep(`round${roundNum + 1}`);
            } else {
                showFinalResults();
                showStep('final');
            }
        };
    }

    function addPricingRow(roundNum, segment, prices, isRepricing) {
        const { numGroups } = state.config;
        const tbody = $(`#r${roundNum}-tbody`);
        const tr = document.createElement('tr');
        tr.className = isRepricing ? 'row-repricing' : 'row-pricing';
        let label = isRepricing ? `改價 #${segment + 1}` : (segment === 0 ? '初始定價' : `定價 #${segment + 1}`);
        let cells = `<td>${label}</td><td>-</td>`;
        for (let g = 0; g < numGroups; g++) {
            cells += `<td>$${fmt(prices[g])}</td>`;
        }
        tr.innerHTML = cells;
        tbody.appendChild(tr);
    }

    function processCustomer(roundNum, wtp, groupState, numSegments, wtpPool) {
        const rd = state.rounds[roundNum];
        const { numGroups, numCustomers, repricingInterval, supplyLimit } = state.config;
        const canReprice = roundNum >= 3;
        const hasSupply = roundNum === 4;

        if (rd.allDrawn || rd.paused) return;

        const drawIdx = rd.drawIndex;
        if (drawIdx >= numCustomers) {
            rd.allDrawn = true;
            finishRound(roundNum, groupState);
            return;
        }

        // Check if repricing needed before this draw
        if (canReprice && drawIdx > 0 && drawIdx % repricingInterval === 0) {
            const nextSeg = Math.floor(drawIdx / repricingInterval);
            if (!rd.groupPrices[nextSeg]) {
                // PAUSE: show banner with button instead of auto-opening modal
                rd.paused = true;
                rd.pendingWtp = wtp;
                showRepricePauseBanner(roundNum, nextSeg, groupState, wtpPool, numSegments);
                return;
            }
        }

        const currentSeg = canReprice ? Math.floor(drawIdx / repricingInterval) : 0;
        const prices = rd.groupPrices[currentSeg] || rd.groupPrices[rd.currentSegment];

        rd.drawIndex++;

        const tbody = $(`#r${roundNum}-tbody`);
        const tr = document.createElement('tr');
        tr.className = 'row-highlight animate-in';
        let cells = `<td>${drawIdx + 1}</td><td><strong>$${fmt(wtp)}</strong></td>`;
        for (let g = 0; g < numGroups; g++) {
            const gPrice = prices[g];
            if (hasSupply && groupState[g].soldOut) {
                if (wtp >= gPrice) {
                    cells += `<td class="cell-oos">已售完</td>`;
                } else {
                    cells += `<td class="cell-no-deal">-</td>`;
                }
            } else if (wtp >= gPrice) {
                groupState[g].deals++;
                groupState[g].revenue += gPrice;
                if (hasSupply) {
                    groupState[g].soldCount++;
                    const soldNum = groupState[g].soldCount;
                    if (groupState[g].soldCount >= supplyLimit) {
                        groupState[g].soldOut = true;
                    }
                    cells += `<td class="cell-deal">$${fmt(gPrice)} (第${soldNum}筆)</td>`;
                } else {
                    cells += `<td class="cell-deal">$${fmt(gPrice)}</td>`;
                }
            } else {
                cells += `<td class="cell-no-deal">-</td>`;
            }
        }
        tr.innerHTML = cells;
        tbody.appendChild(tr);
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        $(`#r${roundNum}-draw-status`).textContent = `已抽取 ${rd.drawIndex} / ${numCustomers} 位`;

        if (rd.drawIndex >= numCustomers) {
            rd.allDrawn = true;
            finishRound(roundNum, groupState);
        }
    }

    // Show a pause banner with performance summary + button to open repricing dialog
    function showRepricePauseBanner(roundNum, segment, groupState, wtpPool, numSegments) {
        const { numGroups, repricingInterval } = state.config;
        const rd = state.rounds[roundNum];
        const bannerEl = $(`#r${roundNum}-reprice-banner`);

        // Build mini performance summary
        let perfHtml = '<table class="summary-table" style="font-size:.8rem;margin-top:.5rem"><thead><tr>';
        perfHtml += '<th>組別</th><th>成交數</th><th>營收</th>';
        if (roundNum === 4) perfHtml += '<th>已售</th>';
        perfHtml += '</tr></thead><tbody>';
        for (let g = 0; g < numGroups; g++) {
            const info = groupState[g];
            perfHtml += `<tr><td>第 ${g + 1} 組</td><td>${info.deals}</td><td>$${fmt(info.revenue)}</td>`;
            if (roundNum === 4) perfHtml += `<td>${info.soldCount}/${state.config.supplyLimit}</td>`;
            perfHtml += '</tr>';
        }
        perfHtml += '</tbody></table>';

        bannerEl.innerHTML = `
        <div class="reprice-pause-banner">
            <div>
                <div class="pause-info">已完成第 ${segment * repricingInterval} 位顧客 — 重新定價機會（第 ${segment + 1} / ${numSegments} 段）</div>
                <div class="pause-hint">請各組檢視目前績效後，再點擊「開始重新定價」進行新一輪定價討論。</div>
            </div>
            <button class="btn btn-warning btn-lg" id="r${roundNum}-open-reprice">開始重新定價</button>
        </div>
        ${perfHtml}`;

        // Disable draw controls
        setDrawControlsDisabled(roundNum, true);

        $(`#r${roundNum}-open-reprice`).onclick = () => {
            showRepricingModal(roundNum, segment, groupState, wtpPool, numSegments, rd.pendingWtp);
        };
    }

    function setDrawControlsDisabled(roundNum, disabled) {
        const { drawMode } = state.config;
        if (drawMode === 'manual') {
            const mi = $(`#r${roundNum}-manual-input`);
            const mb = $(`#r${roundNum}-manual-draw`);
            if (mi) mi.disabled = disabled;
            if (mb) mb.disabled = disabled;
        } else {
            const d1 = $(`#r${roundNum}-draw-one`);
            const d2 = $(`#r${roundNum}-draw-all`);
            if (d1) d1.disabled = disabled;
            if (d2) d2.disabled = disabled;
        }
    }

    function showRepricingModal(roundNum, segment, groupState, wtpPool, numSegments, pendingWtp) {
        const { numGroups } = state.config;
        const rd = state.rounds[roundNum];
        const prevPrices = rd.groupPrices[segment - 1] || rd.groupPrices[0];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        let inputsHtml = '<div class="pricing-input-grid">';
        for (let g = 0; g < numGroups; g++) {
            const prevP = prevPrices[g];
            const info = groupState[g];
            let extra = `成交：${info.deals} 筆，營收：$${fmt(info.revenue)}`;
            if (roundNum === 4) extra += `，已售：${info.soldCount}/${state.config.supplyLimit}`;
            inputsHtml += `
                <div class="pricing-input-card">
                    <label>第 ${g + 1} 組</label>
                    <input type="number" id="rp-${roundNum}-${segment}-${g}" value="${prevP}" min="0" step="any">
                    <div style="font-size:.7rem;color:var(--gray-500);margin-top:.25rem">${extra}</div>
                </div>`;
        }
        inputsHtml += '</div>';

        // QR section for repricing modal
        let modalQR = '';
        if (server.available) {
            const rpName = `${roundNum === 4 ? '第四輪' : '第三輪'} · 改價第 ${segment + 1} 段`;
            server.notifyRound(roundNum, segment, rpName, numGroups);
            modalQR = server.buildQRSection(roundNum, segment, numGroups, rpName);
        }

        overlay.innerHTML = `
        <div class="modal">
            <h3>重新定價 - 第 ${segment + 1} / ${numSegments} 段</h3>
            <p style="margin-bottom:1rem;color:var(--gray-600)">請各組討論後輸入新定價，接下來將抽取 ${state.config.repricingInterval} 位顧客。</p>
            ${modalQR}
            ${inputsHtml}
            <div class="text-center mt-1" style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap">
                <button class="btn btn-outline" id="rp-random-${roundNum}-${segment}">隨機填入定價（QC）</button>
                <button class="btn btn-warning btn-lg" id="rp-confirm-${roundNum}-${segment}">確認新定價</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        // Start polling for repricing modal
        if (server.available) {
            server.startPolling(roundNum, segment, numGroups, (prices, locked) => {
                for (let g = 1; g <= numGroups; g++) {
                    const chip = $(`#qr-chip-${roundNum}-${segment}-${g}`);
                    if (locked[g]) {
                        if (chip) chip.classList.add('submitted');
                        const input = $(`#rp-${roundNum}-${segment}-${g - 1}`);
                        if (input) input.value = prices[g];
                    }
                }
            });
        }

        $(`#rp-random-${roundNum}-${segment}`).onclick = () => {
            const allWtp = state.wtpPrices;
            const lo = Math.min(...allWtp);
            const hi = Math.max(...allWtp);
            const rangeLo = Math.floor(lo * 0.9);
            const rangeHi = Math.ceil(hi * 1.1);
            for (let g = 0; g < numGroups; g++) {
                $(`#rp-${roundNum}-${segment}-${g}`).value = Math.round(rangeLo + Math.random() * (rangeHi - rangeLo));
            }
        };

        $(`#rp-confirm-${roundNum}-${segment}`).onclick = () => {
            server.stopPolling();
            const prices = {};
            let valid = true;
            for (let g = 0; g < numGroups; g++) {
                const v = parseFloat($(`#rp-${roundNum}-${segment}-${g}`).value);
                if (isNaN(v) || v < 0) { valid = false; break; }
                prices[g] = v;
            }
            if (!valid) { alert('請輸入有效的定價。'); return; }
            rd.groupPrices[segment] = prices;
            rd.currentSegment = segment;
            rd.paused = false;
            overlay.remove();

            // Clear the pause banner
            $(`#r${roundNum}-reprice-banner`).innerHTML = '';

            // Re-enable draw controls
            setDrawControlsDisabled(roundNum, false);

            addPricingRow(roundNum, segment, prices, true);
            // Process the pending customer
            processCustomer(roundNum, pendingWtp, groupState, numSegments, wtpPool);
        };
    }

    function finishRound(roundNum, groupState) {
        const { numGroups, numCustomers } = state.config;

        setDrawControlsDisabled(roundNum, true);

        state.rounds[roundNum].groupResults = groupState.map((gs, g) => ({
            group: g + 1,
            deals: gs.deals,
            revenue: gs.revenue,
            ratio: gs.deals / numCustomers,
            avgDealPrice: gs.deals > 0 ? gs.revenue / gs.deals : 0,
        }));

        const results = state.rounds[roundNum].groupResults;
        const sorted = [...results].sort((a, b) => b.revenue - a.revenue);
        const roundNames = { 1: '第一輪', 2: '第二輪', 3: '第三輪', 4: '第四輪' };

        let summaryHtml = `<h3 style="margin-bottom:1rem">${roundNames[roundNum]}結果</h3>`;
        summaryHtml += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        summaryHtml += '<th>排名</th><th>組別</th><th>成交數</th><th>成交率</th><th>營收</th><th>平均成交價</th>';
        summaryHtml += '</tr></thead><tbody>';
        sorted.forEach((r, i) => {
            const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            summaryHtml += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td>第 ${r.group} 組</td>
                <td>${r.deals}</td>
                <td>${(r.ratio * 100).toFixed(1)}%</td>
                <td>$${fmt(r.revenue)}</td>
                <td>$${fmt(Math.round(r.avgDealPrice))}</td>
            </tr>`;
        });
        summaryHtml += '</tbody></table></div>';

        if (roundNum > 1) {
            const cumul = cumulativeResults(roundNum);
            const cSorted = [...cumul].sort((a, b) => b.totalRevenue - a.totalRevenue);
            summaryHtml += `<h3 style="margin:1.5rem 0 1rem">累計排名（第一輪至${roundNames[roundNum]}）</h3>`;
            summaryHtml += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
            summaryHtml += '<th>排名</th><th>組別</th><th>總成交數</th><th>總營收</th><th>平均成交價</th>';
            summaryHtml += '</tr></thead><tbody>';
            cSorted.forEach((r, i) => {
                const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                const avg = r.totalDeals > 0 ? Math.round(r.totalRevenue / r.totalDeals) : 0;
                summaryHtml += `<tr class="${rankClass}">
                    <td>${i + 1}</td>
                    <td>第 ${r.group} 組</td>
                    <td>${r.totalDeals}</td>
                    <td>$${fmt(r.totalRevenue)}</td>
                    <td>$${fmt(avg)}</td>
                </tr>`;
            });
            summaryHtml += '</tbody></table></div>';
        }

        const summaryEl = $(`#r${roundNum}-summary`);
        summaryEl.innerHTML = summaryHtml;
        summaryEl.classList.remove('hidden');
        $(`#r${roundNum}-next`).classList.remove('hidden');
    }

    function cumulativeResults(upToRound) {
        const { numGroups } = state.config;
        const cumul = [];
        for (let g = 0; g < numGroups; g++) {
            let totalDeals = 0, totalRevenue = 0;
            for (let r = 1; r <= upToRound; r++) {
                if (state.rounds[r] && state.rounds[r].groupResults) {
                    const gr = state.rounds[r].groupResults[g];
                    totalDeals += gr.deals;
                    totalRevenue += gr.revenue;
                }
            }
            cumul.push({ group: g + 1, totalDeals, totalRevenue });
        }
        return cumul;
    }

    // ───── FINAL RESULTS ─────
    function showFinalResults() {
        const { numGroups } = state.config;
        const cumul = cumulativeResults(4);
        const sorted = [...cumul].sort((a, b) => b.totalRevenue - a.totalRevenue);

        let html = '';

        if (sorted.length >= 3) {
            html += '<div class="podium">';
            html += `<div class="podium-item podium-2"><div class="podium-rank">第二名</div><div class="podium-name">第 ${sorted[1].group} 組</div><div class="podium-amount">$${fmt(sorted[1].totalRevenue)}</div></div>`;
            html += `<div class="podium-item podium-1"><div class="podium-rank">第一名</div><div class="podium-name">第 ${sorted[0].group} 組</div><div class="podium-amount">$${fmt(sorted[0].totalRevenue)}</div></div>`;
            html += `<div class="podium-item podium-3"><div class="podium-rank">第三名</div><div class="podium-name">第 ${sorted[2].group} 組</div><div class="podium-amount">$${fmt(sorted[2].totalRevenue)}</div></div>`;
            html += '</div>';
        }

        html += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        html += '<th>最終排名</th><th>組別</th><th>總成交數</th><th>總營收</th><th>平均成交價</th>';
        html += '</tr></thead><tbody>';
        sorted.forEach((r, i) => {
            const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            const avg = r.totalDeals > 0 ? Math.round(r.totalRevenue / r.totalDeals) : 0;
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td>第 ${r.group} 組</td>
                <td>${r.totalDeals}</td>
                <td>$${fmt(r.totalRevenue)}</td>
                <td>$${fmt(avg)}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';

        html += '<h3 style="margin:1.5rem 0 1rem">各輪營收明細</h3>';
        html += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        html += '<th>組別</th><th>第一輪</th><th>第二輪</th><th>第三輪</th><th>第四輪</th><th>總計</th>';
        html += '</tr></thead><tbody>';
        for (let g = 0; g < numGroups; g++) {
            let total = 0;
            html += `<tr><td>第 ${g + 1} 組</td>`;
            for (let r = 1; r <= 4; r++) {
                const rev = (state.rounds[r] && state.rounds[r].groupResults) ? state.rounds[r].groupResults[g].revenue : 0;
                total += rev;
                html += `<td>$${fmt(rev)}</td>`;
            }
            html += `<td><strong>$${fmt(total)}</strong></td></tr>`;
        }
        html += '</tbody></table></div>';

        html += '<div class="text-center mt-1"><button class="btn btn-primary btn-lg" id="btn-restart">重新開始遊戲</button></div>';

        $('#final-results').innerHTML = html;
        $('#btn-restart').onclick = () => {
            state.wtpPrices = [];
            state.rounds = {};
            showStep('setup');
        };
    }

    // ───── Utility ─────
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ───── Navigation ─────
    function initNavigation() {
        $$('.nav-btn').forEach(btn => {
            btn.onclick = () => showStep(btn.dataset.step);
        });
    }

    // ───── Clock ─────
    function updateClock() {
        const now = new Date();
        const y = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const el = $('#header-clock');
        if (el) el.textContent = `${y}/${mo}/${d} ${h}:${mi}:${s}`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // ───── Init ─────
    server.detect().then(ok => {
        if (ok) console.log('Server detected at', server.baseUrl, '- QR code input enabled');
        else console.log('No server detected - running in standalone mode (QR disabled)');
    });
    initSetup();
    initNavigation();

})();
