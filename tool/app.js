/* =============================================================
   SaaSSpendTrack — Overcharge Finder
   Zero dependencies. All state in localStorage. Nothing uploaded.
   ============================================================= */

(function () {
  'use strict';

  var KEY = 'sst.vendors.v2';
  var SAMPLE_KEY = 'sst.sample.v2';
  var state = { vendors: [], editingId: null, isSample: false };

  /* ---------- helpers ---------- */

  function uid() { return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  function parseList(s) {
    if (!s) return [];
    return String(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  // "Premium support: 11720" -> {name, amount}
  function parseLineItems(s) {
    return parseList(s).map(function (item) {
      var i = item.lastIndexOf(':');
      if (i === -1) return { name: item, amount: null };
      return { name: item.slice(0, i).trim(), amount: num(item.slice(i + 1)) };
    });
  }

  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- persistence ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        state.vendors = JSON.parse(raw) || [];
        state.isSample = localStorage.getItem(SAMPLE_KEY) === '1';
        return;
      }
    } catch (e) { /* storage blocked — run in memory */ }
    state.vendors = sampleVendors();
    state.isSample = true;
    save();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.vendors));
      localStorage.setItem(SAMPLE_KEY, state.isSample ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  /* ---------- sample data ---------- */

  function sampleVendors() {
    var d = today();
    var iso = function (dt) { return dt.toISOString().slice(0, 10); };
    return [
      {
        id: uid(), name: 'Salesforce',
        cPrice: 18, cSeats: 142, cTier: 'Business', cCap: 5,
        cIncluded: 'Premium support', cWindow: 90, cRef: 'MSA §7.2, Order Form Exhibit A',
        bPrice: 32, bSeats: 190, bTier: 'Enterprise',
        bPrevAnnual: 30672, bThisAnnual: 34168,
        bExtras: 'Premium support: 11720',
        bLastInvoice: iso(addDays(d, -34)), bMonths: 11,
        renewDate: iso(addDays(d, 71)), notice: 60, cancelled: ''
      },
      {
        id: uid(), name: 'Intercom',
        cPrice: 74, cSeats: 20, cTier: 'Advanced', cCap: null,
        cIncluded: '', cWindow: 30, cRef: 'Order Form, 12 Mar',
        bPrice: 89, bSeats: 20, bTier: 'Advanced',
        bPrevAnnual: null, bThisAnnual: null, bExtras: '',
        bLastInvoice: iso(addDays(d, -71)), bMonths: 9,
        renewDate: iso(addDays(d, 22)), notice: 30, cancelled: ''
      },
      {
        id: uid(), name: 'Loom',
        cPrice: 12.5, cSeats: 40, cTier: 'Business', cCap: 7,
        cIncluded: '', cWindow: null, cRef: 'Order Form §3',
        bPrice: 12.5, bSeats: 40, bTier: 'Business',
        bPrevAnnual: null, bThisAnnual: null, bExtras: '',
        bLastInvoice: iso(addDays(d, -20)), bMonths: 5,
        renewDate: iso(addDays(d, 210)), notice: 30,
        cancelled: iso(addDays(d, -150))
      }
    ];
  }

  /* =============================================================
     THE RECONCILIATION ENGINE
     Seven checks. Plain arithmetic. Every finding cites its source.
     ============================================================= */

  function windowStatus(v) {
    var last = parseDate(v.bLastInvoice);
    if (!last) return { code: 'unknown', label: 'No invoice date entered', days: null };
    if (v.cWindow == null || v.cWindow === '') {
      return { code: 'open', label: 'No stated dispute limit', days: null };
    }
    var elapsed = daysBetween(last, today());
    var left = v.cWindow - elapsed;
    if (left < 0) return { code: 'closed', label: 'Dispute window closed ' + Math.abs(left) + 'd ago', days: left };
    if (left <= 14) return { code: 'closing', label: left + 'd left to dispute', days: left };
    return { code: 'open', label: left + 'd left to dispute', days: left };
  }

  function findingsFor(v) {
    var out = [];
    var months = num(v.bMonths) || 12;
    var ws = windowStatus(v);

    function push(type, main, detail, amount) {
      if (!(amount > 0)) return;
      out.push({
        vendor: v.name, type: type, main: main, detail: detail,
        amount: amount, ref: v.cRef || '', window: ws
      });
    }

    var cPrice = num(v.cPrice), bPrice = num(v.bPrice);
    var cSeats = num(v.cSeats), bSeats = num(v.bSeats);

    /* 1. Rate mismatch — billed unit price above contracted */
    if (cPrice != null && bPrice != null && bPrice > cPrice) {
      var seatsForRate = cSeats != null ? cSeats : (bSeats || 0);
      push('Rate above contract',
        'Charged ' + money(bPrice) + '/seat/mo against a contracted rate of ' + money(cPrice),
        '+' + money(bPrice - cPrice) + '/seat × ' + seatsForRate + ' seats × ' + months + ' months',
        (bPrice - cPrice) * seatsForRate * months);
    }

    /* 2. Seat overage — billed above the order form count */
    if (cSeats != null && bSeats != null && bSeats > cSeats) {
      var rate = cPrice != null ? cPrice : bPrice;
      if (rate != null) {
        push('Seats above order form',
          'Billed for ' + bSeats + ' seats where the order form licenses ' + cSeats,
          '+' + (bSeats - cSeats) + ' seats × ' + money(rate) + ' × ' + months + ' months',
          (bSeats - cSeats) * rate * months);
      }
    }

    /* 3. Uplift cap breach */
    var prev = num(v.bPrevAnnual), cur = num(v.bThisAnnual), cap = num(v.cCap);
    if (prev != null && cur != null && cap != null && prev > 0) {
      var applied = ((cur - prev) / prev) * 100;
      if (applied > cap + 0.05) {
        var permitted = prev * (1 + cap / 100);
        push('Uplift cap exceeded',
          'Renewal applied a ' + pct(applied) + ' increase against a contracted ceiling of ' + pct(cap),
          'Permitted ' + money(permitted) + ' · charged ' + money(cur),
          cur - permitted);
      }
    }

    /* 4. Tier mismatch */
    if (v.cTier && v.bTier && v.cTier.trim().toLowerCase() !== v.bTier.trim().toLowerCase()) {
      var tierAmt = 0;
      if (cPrice != null && bPrice != null && bPrice > cPrice) {
        tierAmt = 0; // already captured by the rate check — don't double count
      }
      out.push({
        vendor: v.name, type: 'Tier not as contracted',
        main: 'Billed on ' + esc(v.bTier) + ' where the contract names ' + esc(v.cTier),
        detail: tierAmt ? '' : 'Value shown under the rate finding, if any',
        amount: tierAmt, ref: v.cRef || '', window: ws, noValue: true
      });
    }

    /* 5. Unbundled inclusion — charged for something the fee covers */
    var included = parseList(v.cIncluded).map(function (s) { return s.toLowerCase(); });
    parseLineItems(v.bExtras).forEach(function (item) {
      var match = included.some(function (inc) {
        return item.name.toLowerCase().indexOf(inc) !== -1 || inc.indexOf(item.name.toLowerCase()) !== -1;
      });
      if (match && item.amount > 0) {
        push('Billed for an inclusion',
          esc(item.name) + ' was invoiced separately, but the contract includes it in the subscription fee',
          'Separate line item of ' + money(item.amount),
          item.amount);
      }
    });

    /* 6. Zombie billing — still charging past cancellation */
    var cancelled = parseDate(v.cancelled);
    var lastInv = parseDate(v.bLastInvoice);
    if (cancelled && lastInv && lastInv > cancelled) {
      var monthsAfter = Math.max(1, Math.round(daysBetween(cancelled, lastInv) / 30));
      var monthly = (bPrice != null && bSeats != null) ? bPrice * bSeats
        : (cPrice != null && cSeats != null ? cPrice * cSeats : null);
      if (monthly) {
        push('Billed after cancellation',
          'Invoices continued after the cancellation date of ' + fmtDate(cancelled),
          money(monthly) + '/mo × roughly ' + monthsAfter + ' months',
          monthly * monthsAfter);
      }
    }

    return out;
  }

  function allFindings() {
    var groups = [];
    state.vendors.forEach(function (v) {
      var f = findingsFor(v);
      if (f.length) groups.push({ vendor: v, findings: f });
    });
    return groups;
  }

  function totals() {
    var claimable = 0, expired = 0, count = 0;
    allFindings().forEach(function (g) {
      g.findings.forEach(function (f) {
        if (f.noValue || !(f.amount > 0)) return;
        count++;
        if (f.window.code === 'closed') expired += f.amount;
        else claimable += f.amount;
      });
    });
    return { claimable: claimable, expired: expired, count: count };
  }

  /* =============================================================
     RENDERING
     ============================================================= */

  function renderVendors() {
    var host = el('vendorList');
    if (!state.vendors.length) {
      host.innerHTML = '<div class="empty"><h3>No vendors yet</h3>' +
        '<p>Add one vendor with what its contract says and what you were actually billed. The checks run immediately.</p>' +
        '<button class="btn btn-primary" onclick="document.getElementById(\'btnAdd\').click()">Add your first vendor</button></div>';
      return;
    }

    host.innerHTML = state.vendors.map(function (v) {
      var f = findingsFor(v).filter(function (x) { return !x.noValue && x.amount > 0; });
      var sum = f.reduce(function (a, b) { return a + b.amount; }, 0);
      var flag = f.length
        ? '<span class="vflag bad">' + f.length + ' finding' + (f.length > 1 ? 's' : '') + ' · ' + money(sum) + '</span>'
        : '<span class="vflag ok">Reconciles</span>';
      var bits = [];
      if (v.bSeats) bits.push(v.bSeats + ' seats');
      if (v.bTier) bits.push(esc(v.bTier));
      if (v.renewDate) bits.push('renews ' + fmtDate(parseDate(v.renewDate)));

      return '<div class="vcard">' +
        '<div><h3>' + esc(v.name || 'Untitled vendor') + '</h3>' +
        '<div class="vmeta">' + (bits.join(' · ') || 'No billing details entered') + '</div></div>' +
        flag +
        '<button class="btn btn-ghost btn-sm" data-edit="' + v.id + '">Edit</button>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(host.querySelectorAll('[data-edit]'), function (b) {
      b.addEventListener('click', function () { openDrawer(b.getAttribute('data-edit')); });
    });
  }

  function renderFindings() {
    var host = el('findingList');
    var groups = allFindings();
    var t = totals();

    el('totals').innerHTML =
      '<div class="tcard hero"><span class="v">' + money(t.claimable) + '</span>' +
      '<div class="k">Still claimable — the dispute window is open</div></div>' +
      '<div class="tcard closed"><span class="v">' + money(t.expired) + '</span>' +
      '<div class="k">Already expired — the window closed before anyone looked</div></div>' +
      '<div class="tcard"><span class="v">' + t.count + '</span>' +
      '<div class="k">Charges that don\'t reconcile with your contracts</div></div>';

    if (!groups.length) {
      host.innerHTML = '<div class="empty"><h3>Nothing failed a check</h3>' +
        '<p>Either your vendors are billing you correctly, or there isn\'t enough entered yet for the checks to run. Unit price, seat count and the two annual totals do most of the work.</p></div>';
      el('handoff').hidden = true;
      updatePips();
      return;
    }

    host.innerHTML = groups.map(function (g) {
      var sum = g.findings.reduce(function (a, b) { return a + (b.noValue ? 0 : b.amount || 0); }, 0);
      var rows = g.findings.map(function (f) {
        var w = f.window;
        var wclass = w.code === 'closed' ? 'closed' : (w.code === 'closing' ? 'closing' : 'open');
        return '<div class="finding' + (w.code === 'closed' ? ' is-closed' : '') + '">' +
          '<div>' +
          '<span class="ftype">' + esc(f.type) + '</span>' +
          '<div class="fmain">' + f.main + '</div>' +
          (f.detail ? '<div class="fdetail">' + f.detail + '</div>' : '') +
          (f.ref ? '<div class="fref">Cites: ' + esc(f.ref) + '</div>' : '') +
          '</div>' +
          '<div class="famt">' +
          (f.noValue ? '<span class="n" style="color:var(--graphite-dim);font-size:.85rem">no $ value</span>'
            : '<span class="n">' + money(f.amount) + '</span>') +
          '<span class="wstat ' + wclass + '">' + esc(w.label) + '</span>' +
          '</div></div>';
      }).join('');

      return '<div class="fgroup"><div class="fgroup-head">' +
        '<h3>' + esc(g.vendor.name) + '</h3>' +
        '<span class="sum">' + money(sum) + '</span></div>' + rows + '</div>';
    }).join('');

    var h = el('handoff');
    h.hidden = false;
    el('handoffTitle').textContent = t.claimable > 0
      ? money(t.claimable) + ' is still claimable'
      : 'Every window on these findings has closed';
    el('btnLetters').disabled = false;
    updatePips();
  }

  function renderRenewals() {
    var host = el('renewalList');
    var rows = state.vendors
      .filter(function (v) { return v.renewDate; })
      .map(function (v) {
        var renew = parseDate(v.renewDate);
        var notice = num(v.notice) || 0;
        var actBy = addDays(renew, -notice);
        var left = daysBetween(today(), actBy);
        return { v: v, renew: renew, notice: notice, actBy: actBy, left: left };
      })
      .sort(function (a, b) { return a.left - b.left; });

    if (!rows.length) {
      host.innerHTML = '<div class="empty"><h3>No renewal dates entered</h3>' +
        '<p>Add a renewal date and a notice period to a vendor and we\'ll count back to the last day you can give notice.</p></div>';
      updatePips();
      return;
    }

    host.innerHTML = rows.map(function (r) {
      var cls, cnt;
      if (r.left < 0) { cls = 'past'; cnt = 'Window closed'; }
      else if (r.left <= 14) { cls = 'urgent'; cnt = r.left + ' days left'; }
      else if (r.left <= 45) { cls = 'soon'; cnt = r.left + ' days left'; }
      else { cls = 'ok'; cnt = r.left + ' days left'; }

      return '<div class="rrow ' + cls + '">' +
        '<div><span class="rlabel">Vendor</span><span class="rval">' + esc(r.v.name) + '</span></div>' +
        '<div><span class="rlabel">Renews</span><span class="rval">' + fmtDate(r.renew) + '</span></div>' +
        '<div><span class="rlabel">Give notice by</span><span class="rval">' + fmtDate(r.actBy) +
        (r.notice ? ' <span style="color:var(--graphite-dim)">(' + r.notice + 'd)</span>' : '') + '</span></div>' +
        '<div class="rcount ' + cls + '">' + cnt + '</div>' +
        '</div>';
    }).join('');

    updatePips();
  }

  function updatePips() {
    var t = totals();
    var pf = el('pipFindings');
    pf.textContent = t.count;
    pf.hidden = t.count === 0;

    var urgent = state.vendors.filter(function (v) {
      if (!v.renewDate) return false;
      var left = daysBetween(today(), addDays(parseDate(v.renewDate), -(num(v.notice) || 0)));
      return left >= 0 && left <= 45;
    }).length;
    var pr = el('pipRenewals');
    pr.textContent = urgent;
    pr.hidden = urgent === 0;
  }

  function renderAll() {
    renderVendors();
    renderFindings();
    renderRenewals();
    el('sampleBanner').hidden = !state.isSample;
  }

  /* =============================================================
     DRAWER
     ============================================================= */

  var FIELDS = [
    ['f_name', 'name'], ['f_cPrice', 'cPrice'], ['f_cSeats', 'cSeats'], ['f_cTier', 'cTier'],
    ['f_cCap', 'cCap'], ['f_cIncluded', 'cIncluded'], ['f_cWindow', 'cWindow'], ['f_cRef', 'cRef'],
    ['f_bPrice', 'bPrice'], ['f_bSeats', 'bSeats'], ['f_bTier', 'bTier'],
    ['f_bPrevAnnual', 'bPrevAnnual'], ['f_bThisAnnual', 'bThisAnnual'], ['f_bExtras', 'bExtras'],
    ['f_bLastInvoice', 'bLastInvoice'], ['f_bMonths', 'bMonths'],
    ['f_renewDate', 'renewDate'], ['f_notice', 'notice'], ['f_cancelled', 'cancelled']
  ];

  function openDrawer(id) {
    state.editingId = id || null;
    var v = id ? state.vendors.filter(function (x) { return x.id === id; })[0] : null;
    el('drawerTitle').textContent = v ? 'Edit ' + v.name : 'Add vendor';
    el('btnDelete').hidden = !v;

    FIELDS.forEach(function (f) {
      var input = el(f[0]);
      var val = v ? v[f[1]] : '';
      input.value = (val === null || val === undefined) ? '' : val;
    });

    el('scrim').hidden = false;
    el('drawer').hidden = false;
    el('f_name').focus();
  }

  function closeDrawer() {
    el('scrim').hidden = true;
    el('drawer').hidden = true;
    state.editingId = null;
  }

  function saveVendor() {
    var name = el('f_name').value.trim();
    if (!name) { toast('Give the vendor a name first.'); el('f_name').focus(); return; }

    var rec = state.editingId
      ? state.vendors.filter(function (x) { return x.id === state.editingId; })[0]
      : { id: uid() };

    FIELDS.forEach(function (f) {
      var raw = el(f[0]).value;
      var numericFields = ['cPrice', 'cSeats', 'cCap', 'cWindow', 'bPrice', 'bSeats',
        'bPrevAnnual', 'bThisAnnual', 'bMonths', 'notice'];
      if (numericFields.indexOf(f[1]) !== -1) {
        rec[f[1]] = raw === '' ? null : num(raw);
      } else {
        rec[f[1]] = raw.trim();
      }
    });

    if (!state.editingId) state.vendors.push(rec);

    if (state.isSample) {
      // First real vendor added — sample data is no longer what they're looking at
      var sampleNames = ['Salesforce', 'Intercom', 'Loom'];
      var hasOwn = state.vendors.some(function (v) { return sampleNames.indexOf(v.name) === -1; });
      if (hasOwn) state.isSample = false;
    }

    save();
    renderAll();
    closeDrawer();
    toast(state.editingId ? 'Vendor updated.' : 'Vendor added.');
  }

  function deleteVendor() {
    if (!state.editingId) return;
    if (!confirm('Delete this vendor and its findings?')) return;
    state.vendors = state.vendors.filter(function (x) { return x.id !== state.editingId; });
    save();
    renderAll();
    closeDrawer();
    toast('Vendor deleted.');
  }

  /* =============================================================
     EXPORT
     ============================================================= */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    var payload = {
      exported: new Date().toISOString(),
      source: 'saasspendtrack-overcharge-finder',
      vendors: state.vendors,
      findings: allFindings().map(function (g) {
        return {
          vendor: g.vendor.name,
          findings: g.findings.map(function (f) {
            return {
              type: f.type,
              summary: f.main.replace(/<[^>]*>/g, ''),
              basis: f.detail.replace(/<[^>]*>/g, ''),
              amount: f.noValue ? null : Math.round(f.amount),
              clauseRef: f.ref,
              disputeWindow: f.window.label
            };
          })
        };
      }),
      totals: totals()
    };
    download('saasspendtrack-findings.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Exported.');
  }

  function exportLetters() {
    var groups = allFindings();
    if (!groups.length) { toast('No findings to write up yet.'); return; }

    var out = groups.map(function (g) {
      var live = g.findings.filter(function (f) { return !f.noValue && f.amount > 0; });
      if (!live.length) return '';
      var sum = live.reduce(function (a, b) { return a + b.amount; }, 0);
      var closed = live.every(function (f) { return f.window.code === 'closed'; });

      var lines = [];
      lines.push('=========================================================');
      lines.push('DRAFT — BILLING DISCREPANCY NOTICE');
      lines.push('Vendor: ' + g.vendor.name);
      lines.push('Prepared: ' + new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }));
      lines.push('=========================================================');
      lines.push('');
      if (closed) {
        lines.push('[!] Every finding below sits outside the invoice dispute window');
        lines.push('    stated in this contract. Confirm the position before sending.');
        lines.push('');
      }
      lines.push('To whom it may concern,');
      lines.push('');
      lines.push('We have reconciled our invoices against the terms of our agreement');
      lines.push('and identified the following discrepancies. We ask that these be');
      lines.push('reviewed and credited.');
      lines.push('');

      live.forEach(function (f, i) {
        lines.push((i + 1) + '. ' + f.type.toUpperCase());
        lines.push('   ' + f.main.replace(/<[^>]*>/g, ''));
        if (f.detail) lines.push('   Basis: ' + f.detail.replace(/<[^>]*>/g, ''));
        if (f.ref) lines.push('   Contract reference: ' + f.ref);
        lines.push('   Amount claimed: ' + money(f.amount));
        lines.push('   Dispute window: ' + f.window.label);
        lines.push('');
      });

      lines.push('---------------------------------------------------------');
      lines.push('TOTAL CLAIMED: ' + money(sum));
      lines.push('---------------------------------------------------------');
      lines.push('');
      lines.push('Please confirm receipt and let us know the expected timeline');
      lines.push('for issuing the corresponding credit note.');
      lines.push('');
      lines.push('Regards,');
      lines.push('[Your name] — [Your company]');
      lines.push('');
      lines.push('');
      lines.push('NOTE: This is a draft generated from figures you entered. Check');
      lines.push('every number against the source documents before sending, and');
      lines.push('have it reviewed if the amount is material.');
      lines.push('');
      lines.push('');
      return lines.join('\n');
    }).filter(Boolean).join('\n\n');

    download('dispute-letters-draft.txt', out, 'text/plain');
    toast('Drafts downloaded.');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var list = Array.isArray(data) ? data : data.vendors;
        if (!Array.isArray(list)) throw new Error('No vendors array found');
        list.forEach(function (v) { if (!v.id) v.id = uid(); });
        state.vendors = list;
        state.isSample = false;
        save();
        renderAll();
        el('importMsg').textContent = 'Imported ' + list.length + ' vendors.';
        toast('Imported.');
      } catch (e) {
        el('importMsg').textContent = "That file didn't parse. Expected JSON with a vendors array.";
      }
    };
    reader.readAsText(file);
  }

  /* =============================================================
     WIRING
     ============================================================= */

  function switchView(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-view') === name);
    });
  }

  function init() {
    load();
    renderAll();

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { switchView(t.getAttribute('data-view')); });
    });

    el('btnAdd').addEventListener('click', function () { openDrawer(null); });
    el('btnSave').addEventListener('click', saveVendor);
    el('btnCancel').addEventListener('click', closeDrawer);
    el('btnCloseDrawer').addEventListener('click', closeDrawer);
    el('btnDelete').addEventListener('click', deleteVendor);
    el('scrim').addEventListener('click', closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el('drawer').hidden) closeDrawer();
    });

    el('btnClearSample').addEventListener('click', function () {
      state.vendors = [];
      state.isSample = false;
      save();
      renderAll();
      switchView('vendors');
      toast('Sample cleared.');
    });

    el('btnExport').addEventListener('click', exportJSON);
    el('btnLetters').addEventListener('click', exportLetters);
    el('btnWipe').addEventListener('click', function () {
      if (!confirm('Delete every vendor stored in this browser?')) return;
      state.vendors = []; state.isSample = false;
      save(); renderAll();
      toast('All data deleted.');
    });

    el('fileImport').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
