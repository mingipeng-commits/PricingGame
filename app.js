/* ============================================================
   Pricing Game - Revenue Management Simulation
   ============================================================ */

(function () {
    'use strict';

    // ───── Game State ─────
    const state = {
        config: {
            numStudents: 40,
            numGroups: 8,
            numCustomers: 20,
            repricingInterval: 5,
            supplyLimit: 7,
            productName: 'Travel Package',
        },
        wtpPrices: [],          // all collected WTP prices
        rounds: {},             // round data keyed by round number (1-4)
        currentStep: 'setup',
    };

    // ───── DOM Helpers ─────
    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

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
            state.config.productName = $('#productName').value || 'Product';
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

        // Quick entry
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

        // Bulk entry
        $('#btn-bulk-wtp').onclick = () => {
            const raw = $('#wtp-bulk').value;
            const nums = raw.split(/[\s,;\n]+/).map(Number).filter(n => !isNaN(n) && n >= 0);
            state.wtpPrices.push(...nums);
            $('#wtp-bulk').value = '';
            renderWTPTags();
        };

        // Random generation
        $('#btn-random-wtp').onclick = () => {
            const need = state.config.numStudents - state.wtpPrices.length;
            if (need <= 0) return;
            for (let i = 0; i < need; i++) {
                state.wtpPrices.push(Math.round(50 + Math.random() * 450));
            }
            renderWTPTags();
        };

        // Proceed
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
            tag.innerHTML = `$${p} <span class="remove" data-idx="${i}">&times;</span>`;
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
        const { numGroups, numCustomers, repricingInterval, supplyLimit } = state.config;
        const container = $(`.round-container[data-round="${roundNum}"]`);
        const canReprice = roundNum >= 3;
        const hasSupply = roundNum === 4;

        const roundData = {
            groupPrices: {},       // { segmentIndex: { groupIdx: price } }
            draws: [],
            results: [],           // per-group results array
            drawIndex: 0,
            currentSegment: 0,
            allDrawn: false,
        };
        state.rounds[roundNum] = roundData;

        // Compute number of segments
        const numSegments = canReprice ? Math.ceil(numCustomers / repricingInterval) : 1;

        // Build HTML
        let descText = '';
        if (roundNum === 1) descText = 'Each group sets a price. We draw customers randomly and check if the WTP >= group price (deal) or not.';
        else if (roundNum === 2) descText = 'Based on Round 1 results & market prices, each group sets a new price. A fresh set of customers is drawn.';
        else if (roundNum === 3) descText = `Like Round 2, but groups can reprice every ${repricingInterval} customers. Total ${numSegments} pricing opportunities.`;
        else descText = `Final round! Same repricing rules, but each group only has ${supplyLimit} units of supply. Once sold out, no more deals.`;

        let html = `
        <div class="card">
            <div class="round-header">
                <h2>Round ${roundNum}${roundNum === 4 ? ' (Final)' : ''}</h2>
                <span class="round-badge ${roundNum === 4 ? 'badge-danger' : 'badge-info'}">
                    ${hasSupply ? `Supply: ${supplyLimit} units` : `${numCustomers} customers`}
                </span>
            </div>
            <div class="round-description">${descText}</div>
            <div id="r${roundNum}-pricing-section">
                <h3 style="margin-bottom:.75rem">Group Pricing ${canReprice ? '(Segment 1)' : ''}</h3>
                <div class="pricing-input-grid" id="r${roundNum}-pricing-grid"></div>
                <button class="btn btn-primary" id="r${roundNum}-submit-prices">Lock Prices &amp; Start Drawing</button>
            </div>
            <div id="r${roundNum}-game-area" class="hidden">
                <div class="draw-controls">
                    <button class="btn btn-primary" id="r${roundNum}-draw-one">Draw Next Customer</button>
                    <button class="btn btn-secondary" id="r${roundNum}-draw-all">Draw All Remaining</button>
                    <span class="draw-status" id="r${roundNum}-draw-status">0 / ${numCustomers} drawn</span>
                </div>
                <div class="round-table-wrap">
                    <table class="round-table" id="r${roundNum}-table">
                        <thead id="r${roundNum}-thead"></thead>
                        <tbody id="r${roundNum}-tbody"></tbody>
                    </table>
                </div>
            </div>
            <div id="r${roundNum}-summary" class="hidden"></div>
            <div class="round-nav">
                ${roundNum > 1 ? `<button class="btn btn-secondary" id="r${roundNum}-prev">Back to Round ${roundNum - 1}</button>` : '<span></span>'}
                <button class="btn btn-success btn-lg hidden" id="r${roundNum}-next">${roundNum < 4 ? `Proceed to Round ${roundNum + 1}` : 'View Final Results'}</button>
            </div>
        </div>`;
        container.innerHTML = html;

        // Build pricing inputs
        const pricingGrid = $(`#r${roundNum}-pricing-grid`);
        for (let g = 0; g < numGroups; g++) {
            const div = document.createElement('div');
            div.className = 'pricing-input-card';
            div.innerHTML = `<label>Group ${g + 1}</label><input type="number" id="r${roundNum}-gp-${g}" min="0" step="any" placeholder="Price">`;
            pricingGrid.appendChild(div);
        }

        // Build table header
        const thead = $(`#r${roundNum}-thead`);
        let hRow = '<tr><th>#</th><th>WTP Price</th>';
        for (let g = 0; g < numGroups; g++) hRow += `<th class="group-header">Group ${g + 1}</th>`;
        hRow += '</tr>';
        thead.innerHTML = hRow;

        // State per group for this round
        const groupState = [];
        for (let g = 0; g < numGroups; g++) {
            groupState.push({ deals: 0, revenue: 0, soldOut: false, soldCount: 0 });
        }

        // Shuffle WTP for this round
        let wtpPool = [...state.wtpPrices];
        shuffle(wtpPool);
        wtpPool = wtpPool.slice(0, numCustomers);

        // Submit prices
        $(`#r${roundNum}-submit-prices`).onclick = () => {
            const seg = roundData.currentSegment;
            const prices = {};
            let valid = true;
            for (let g = 0; g < numGroups; g++) {
                const v = parseFloat($(`#r${roundNum}-gp-${g}`).value);
                if (isNaN(v) || v < 0) { valid = false; break; }
                prices[g] = v;
            }
            if (!valid) { alert('Please enter a valid price for every group.'); return; }
            roundData.groupPrices[seg] = prices;

            // Lock inputs
            for (let g = 0; g < numGroups; g++) {
                $(`#r${roundNum}-gp-${g}`).disabled = true;
                $(`#r${roundNum}-gp-${g}`).closest('.pricing-input-card').classList.add('submitted');
            }
            $(`#r${roundNum}-submit-prices`).classList.add('hidden');

            // Add pricing row to table
            addPricingRow(roundNum, seg, prices, false);

            // Show game area
            $(`#r${roundNum}-game-area`).classList.remove('hidden');
        };

        // Draw one
        $(`#r${roundNum}-draw-one`).onclick = () => drawCustomer(roundNum, wtpPool, groupState, numSegments);
        // Draw all
        $(`#r${roundNum}-draw-all`).onclick = () => {
            const delay = 150;
            let count = 0;
            const interval = setInterval(() => {
                if (roundData.allDrawn) { clearInterval(interval); return; }
                drawCustomer(roundNum, wtpPool, groupState, numSegments);
                count++;
                if (count > numCustomers + numSegments) clearInterval(interval);
            }, delay);
        };

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
        let label = isRepricing ? `Reprice #${segment + 1}` : (segment === 0 ? 'Set Price' : `Price #${segment + 1}`);
        let cells = `<td>${label}</td><td>-</td>`;
        for (let g = 0; g < numGroups; g++) {
            cells += `<td>$${prices[g]}</td>`;
        }
        tr.innerHTML = cells;
        tbody.appendChild(tr);
    }

    function drawCustomer(roundNum, wtpPool, groupState, numSegments) {
        const rd = state.rounds[roundNum];
        const { numGroups, numCustomers, repricingInterval, supplyLimit } = state.config;
        const canReprice = roundNum >= 3;
        const hasSupply = roundNum === 4;

        if (rd.allDrawn) return;

        const drawIdx = rd.drawIndex;
        if (drawIdx >= numCustomers) {
            rd.allDrawn = true;
            finishRound(roundNum, groupState);
            return;
        }

        // Check if we need repricing before this draw
        if (canReprice && drawIdx > 0 && drawIdx % repricingInterval === 0) {
            const nextSeg = Math.floor(drawIdx / repricingInterval);
            if (!rd.groupPrices[nextSeg]) {
                // Show repricing modal
                showRepricingModal(roundNum, nextSeg, groupState, wtpPool, numSegments);
                return;
            }
        }

        // Determine current segment
        const currentSeg = canReprice ? Math.floor(drawIdx / repricingInterval) : 0;
        const prices = rd.groupPrices[currentSeg] || rd.groupPrices[rd.currentSegment];

        const wtp = wtpPool[drawIdx];
        rd.drawIndex++;

        // Build row
        const tbody = $(`#r${roundNum}-tbody`);
        const tr = document.createElement('tr');
        tr.className = 'row-highlight animate-in';
        let cells = `<td>${drawIdx + 1}</td><td><strong>$${wtp}</strong></td>`;
        for (let g = 0; g < numGroups; g++) {
            const gPrice = prices[g];
            if (hasSupply && groupState[g].soldOut) {
                if (wtp >= gPrice) {
                    cells += `<td class="cell-oos">Out of Stock</td>`;
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
                    cells += `<td class="cell-deal">$${gPrice} (#${soldNum})</td>`;
                } else {
                    cells += `<td class="cell-deal">$${gPrice}</td>`;
                }
            } else {
                cells += `<td class="cell-no-deal">-</td>`;
            }
        }
        tr.innerHTML = cells;
        tbody.appendChild(tr);
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        $(`#r${roundNum}-draw-status`).textContent = `${rd.drawIndex} / ${numCustomers} drawn`;

        // Check if done
        if (rd.drawIndex >= numCustomers) {
            rd.allDrawn = true;
            finishRound(roundNum, groupState);
        }
    }

    function showRepricingModal(roundNum, segment, groupState, wtpPool, numSegments) {
        const { numGroups } = state.config;
        const rd = state.rounds[roundNum];
        const prevPrices = rd.groupPrices[segment - 1] || rd.groupPrices[0];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        let inputsHtml = '<div class="pricing-input-grid">';
        for (let g = 0; g < numGroups; g++) {
            const prevP = prevPrices[g];
            const info = groupState[g];
            let extra = `Deals: ${info.deals}, Revenue: $${info.revenue}`;
            if (roundNum === 4) extra += `, Sold: ${info.soldCount}/${state.config.supplyLimit}`;
            inputsHtml += `
                <div class="pricing-input-card">
                    <label>Group ${g + 1}</label>
                    <input type="number" id="rp-${roundNum}-${segment}-${g}" value="${prevP}" min="0" step="any">
                    <div style="font-size:.7rem;color:var(--gray-500);margin-top:.25rem">${extra}</div>
                </div>`;
        }
        inputsHtml += '</div>';

        overlay.innerHTML = `
        <div class="modal">
            <h3>Repricing Opportunity - Segment ${segment + 1} of ${numSegments}</h3>
            <p style="margin-bottom:1rem;color:var(--gray-600)">Review performance and set new prices for the next ${state.config.repricingInterval} customers.</p>
            ${inputsHtml}
            <div class="text-center mt-1">
                <button class="btn btn-warning btn-lg" id="rp-confirm-${roundNum}-${segment}">Confirm New Prices</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        $(`#rp-confirm-${roundNum}-${segment}`).onclick = () => {
            const prices = {};
            let valid = true;
            for (let g = 0; g < numGroups; g++) {
                const v = parseFloat($(`#rp-${roundNum}-${segment}-${g}`).value);
                if (isNaN(v) || v < 0) { valid = false; break; }
                prices[g] = v;
            }
            if (!valid) { alert('Please enter valid prices.'); return; }
            rd.groupPrices[segment] = prices;
            rd.currentSegment = segment;
            overlay.remove();

            // Add repricing row
            addPricingRow(roundNum, segment, prices, true);

            // Continue drawing
            drawCustomer(roundNum, wtpPool, groupState, numSegments);
        };
    }

    function finishRound(roundNum, groupState) {
        const { numGroups, numCustomers } = state.config;

        // Disable draw buttons
        $(`#r${roundNum}-draw-one`).disabled = true;
        $(`#r${roundNum}-draw-all`).disabled = true;

        // Store results
        state.rounds[roundNum].groupResults = groupState.map((gs, g) => ({
            group: g + 1,
            deals: gs.deals,
            revenue: gs.revenue,
            ratio: gs.deals / numCustomers,
            avgDealPrice: gs.deals > 0 ? gs.revenue / gs.deals : 0,
        }));

        // Build summary
        const results = state.rounds[roundNum].groupResults;
        const sorted = [...results].sort((a, b) => b.revenue - a.revenue);

        let summaryHtml = `<h3 style="margin-bottom:1rem">Round ${roundNum} Results</h3>`;
        summaryHtml += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        summaryHtml += '<th>Rank</th><th>Group</th><th>Deals</th><th>Success Rate</th><th>Revenue</th><th>Avg Price/Deal</th>';
        summaryHtml += '</tr></thead><tbody>';
        sorted.forEach((r, i) => {
            const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            summaryHtml += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td>Group ${r.group}</td>
                <td>${r.deals}</td>
                <td>${(r.ratio * 100).toFixed(1)}%</td>
                <td>$${r.revenue.toFixed(0)}</td>
                <td>$${r.avgDealPrice.toFixed(1)}</td>
            </tr>`;
        });
        summaryHtml += '</tbody></table></div>';

        // Cumulative ranking
        if (roundNum > 1) {
            const cumul = cumulativeResults(roundNum);
            const cSorted = [...cumul].sort((a, b) => b.totalRevenue - a.totalRevenue);
            summaryHtml += `<h3 style="margin:1.5rem 0 1rem">Cumulative Rankings (Rounds 1-${roundNum})</h3>`;
            summaryHtml += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
            summaryHtml += '<th>Rank</th><th>Group</th><th>Total Deals</th><th>Total Revenue</th><th>Avg Price/Deal</th>';
            summaryHtml += '</tr></thead><tbody>';
            cSorted.forEach((r, i) => {
                const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                summaryHtml += `<tr class="${rankClass}">
                    <td>${i + 1}</td>
                    <td>Group ${r.group}</td>
                    <td>${r.totalDeals}</td>
                    <td>$${r.totalRevenue.toFixed(0)}</td>
                    <td>$${r.totalDeals > 0 ? (r.totalRevenue / r.totalDeals).toFixed(1) : '0'}</td>
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

        // Podium
        if (sorted.length >= 3) {
            html += '<div class="podium">';
            html += `<div class="podium-item podium-2"><div class="podium-rank">2nd</div><div class="podium-name">Group ${sorted[1].group}</div><div class="podium-amount">$${sorted[1].totalRevenue.toFixed(0)}</div></div>`;
            html += `<div class="podium-item podium-1"><div class="podium-rank">1st</div><div class="podium-name">Group ${sorted[0].group}</div><div class="podium-amount">$${sorted[0].totalRevenue.toFixed(0)}</div></div>`;
            html += `<div class="podium-item podium-3"><div class="podium-rank">3rd</div><div class="podium-name">Group ${sorted[2].group}</div><div class="podium-amount">$${sorted[2].totalRevenue.toFixed(0)}</div></div>`;
            html += '</div>';
        }

        // Full table
        html += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        html += '<th>Final Rank</th><th>Group</th><th>Total Deals</th><th>Total Revenue</th><th>Avg Price/Deal</th>';
        html += '</tr></thead><tbody>';
        sorted.forEach((r, i) => {
            const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
            const avg = r.totalDeals > 0 ? (r.totalRevenue / r.totalDeals).toFixed(1) : '0';
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td>Group ${r.group}</td>
                <td>${r.totalDeals}</td>
                <td>$${r.totalRevenue.toFixed(0)}</td>
                <td>$${avg}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';

        // Per-round breakdown
        html += '<h3 style="margin:1.5rem 0 1rem">Per-Round Breakdown</h3>';
        html += '<div class="summary-table-wrap"><table class="summary-table"><thead><tr>';
        html += '<th>Group</th><th>R1 Revenue</th><th>R2 Revenue</th><th>R3 Revenue</th><th>R4 Revenue</th><th>Total</th>';
        html += '</tr></thead><tbody>';
        for (let g = 0; g < numGroups; g++) {
            let total = 0;
            html += `<tr><td>Group ${g + 1}</td>`;
            for (let r = 1; r <= 4; r++) {
                const rev = (state.rounds[r] && state.rounds[r].groupResults) ? state.rounds[r].groupResults[g].revenue : 0;
                total += rev;
                html += `<td>$${rev.toFixed(0)}</td>`;
            }
            html += `<td><strong>$${total.toFixed(0)}</strong></td></tr>`;
        }
        html += '</tbody></table></div>';

        // Restart button
        html += '<div class="text-center mt-1"><button class="btn btn-primary btn-lg" id="btn-restart">Start New Game</button></div>';

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

    // ───── Navigation Clicks ─────
    function initNavigation() {
        $$('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                const step = btn.dataset.step;
                showStep(step);
            };
        });
    }

    // ───── Init ─────
    initSetup();
    initNavigation();

})();
