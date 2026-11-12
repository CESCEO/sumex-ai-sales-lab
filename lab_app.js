(function () {
  "use strict";
  var D = null, KEY = null, META = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var won = function (n) { return (n || 0).toLocaleString("ko-KR"); };
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var ymd = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var dow = function (s) { return DOW[new Date(s + "T00:00:00").getDay()]; };
  var TODAY = ymd(new Date());
  var TYPES = ["선납", "판매", "마감", "가납", "가납랜딩", "교환", "샘플", "납품", "데모", "수리", "견적서", "서류등록"];
  var CATS = ["납품", "데모", "수리", "교환", "견적서", "서류등록", "기타"];
  var NAVS = [["dash", "대시보드"], ["journal", "영업 일지"], ["hosp", "병원별"], ["cal", "캘린더"], ["todo", "할 일"], ["target", "매출 목표"], ["deliv", "납품·간납사"], ["docs", "서류"], ["lion", "청담리온"], ["clinic", "외래일정"]];
  var S = { view: "dash", date: null, h: "", ty: [], q: "", hsel: null, htab: "time", from: "", to: "", cm: TODAY.slice(0, 7), cd: TODAY, tm: "", dty: "", itemq: "", docq: "", docty: "", dh: "" };

  function ls(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- crypto ---------- */
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function deriveKey(pass, salt, iter) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (m) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, m, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    });
  }
  function decBuf(buf) { var u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, KEY, u.slice(12)); }
  function unlock(pass) {
    return fetch("meta.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
      META = m; return deriveKey(pass, unb64(m.salt), m.iter);
    }).then(function (k) { KEY = k; return fetch("data.bin", { cache: "no-store" }); })
      .then(function (r) { return r.arrayBuffer(); }).then(decBuf)
      .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  /* ---------- helpers ---------- */
  function hospList() { return D.hospitals.concat(["기타"]); }
  function hOf(e) { return e.h || "기타"; }
  function tyBadges(e) { return (e.ty || []).filter(function (t, i, a) { return a.indexOf(t) === i; }).map(function (t) { return '<span class="bd t-' + esc(t) + '">' + esc(t) + "</span>"; }).join(""); }
  function kindLabel(k) { return { log: "일지", mail_out: "발송", mail_in: "수신", order: "이카운트", lion: "리온" }[k] || k; }
  function evMatch(e) {
    if (S.h && hOf(e) !== S.h) return false;
    if (S.ty.length && !(e.ty || []).some(function (t) { return S.ty.indexOf(t) >= 0; })) return false;
    if (S.q) { var q = S.q.toLowerCase(); if ((e.title + " " + (e.sum || "")).toLowerCase().indexOf(q) < 0) return false; }
    return true;
  }
  function sales(h, ym) {
    var s = 0;
    D.lines.forEach(function (l) { if ((l.h || "기타") === h && l.d.slice(0, 7) === ym && l.amt > 0 && l.type !== "샘플") s += l.amt; });
    return s;
  }
  function todos() {
    var st = ls("lab_todo", { done: {}, del: {}, custom: [] });
    var base = (D.todos || []).filter(function (t) { return !st.del[t.id]; }).map(function (t) { return Object.assign({}, t, { done: !!st.done[t.id] }); });
    var cu = st.custom.filter(function (t) { return !st.del[t.id]; }).map(function (t) { return Object.assign({}, t, { done: !!st.done[t.id] }); });
    return base.concat(cu);
  }
  function chipsUI(arr, cur, fn) { return '<div class="chips">' + arr.map(function (t) { return '<span class="chip' + (cur.indexOf(t) >= 0 ? " on" : "") + '" data-ch="' + fn + '" data-v="' + esc(t) + '">' + esc(t) + "</span>"; }).join("") + "</div>"; }
  function hSelect(cur, id) { return '<select class="f" id="' + id + '"><option value="">전체 병원</option>' + hospList().map(function (h) { return '<option' + (h === cur ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>"; }
  function evRow(e, showDate) {
    var more = e.full && e.full.length > (e.sum || "").length + 5;
    return '<div class="row"><div class="tm">' + (showDate ? esc(e.d.slice(5)) + "<br>" : "") + esc(e.t || "") + '</div><div style="flex:1;min-width:0"><span class="bd h">' + esc(hOf(e)) + '</span><span class="bd">' + kindLabel(e.k) + "</span>" + tyBadges(e) + '<div><b>' + esc(e.title) + "</b>" + (e.amt ? ' <span class="mut">' + won(e.amt) + "원</span>" : "") + (e.st ? ' <span class="mut">' + esc(e.st) + "</span>" : "") + "</div>" +
      (e.sum ? '<div class="sum" data-sum="' + e.id + '">' + esc(e.sum) + "</div>" : "") + (more ? '<span class="more" data-more="' + e.id + '">전체 보기</span>' : "") + "</div></div>";
  }

  /* ---------- views ---------- */
  function vDash() {
    var calToday = D.cal.filter(function (c) { return c.d === TODAY && !c.rec; });
    var next = D.cal.filter(function (c) { return c.d > TODAY && c.d <= ymd(new Date(Date.now() + 6 * 864e5)) && !c.rec; });
    var td = todos().filter(function (t) { return !t.done; });
    var due = td.filter(function (t) { return t.due && t.due <= ymd(new Date(Date.now() + 3 * 864e5)); });
    var ym = TODAY.slice(0, 7), tot = 0, goal = 0, tg = ls("lab_target", {});
    D.hospitals.forEach(function (h) { tot += sales(h, ym); goal += +(tg[h + "|" + ym] || 0); });
    var pend = D.orders.filter(function (o) { return o.st === "진행중"; });
    var ldl = (D.lion && D.lion.deliveries || []).filter(function (d) { var s = (D.lion.state.deliveries || {})[d.id]; return !(s && s.status === "done") && !d.fixed; });
    var usage = D.orders.filter(function (o) { return /사용분/.test(o.hosp) && o.d >= ymd(new Date(Date.now() - 14 * 864e5)); });
    var recent = D.events.filter(function (e) { return e.k === "log" || e.k === "mail_out"; }).sort(function (a, b) { return (b.d + b.t).localeCompare(a.d + a.t); }).slice(0, 8);
    return '<h2>대시보드<small>' + TODAY + " (" + dow(TODAY) + ")</small></h2>" +
      '<div class="grid g4"><div class="card kpi"><span>오늘 일정</span><b>' + calToday.length + '</b><i>이번 주 ' + next.length + "건 더</i></div>" +
      '<div class="card kpi"><span>미완료 할 일</span><b>' + td.length + '</b><i>3일 내 마감 ' + due.length + "건</i></div>" +
      '<div class="card kpi"><span>' + ym.slice(5) + '월 매출(이카운트)</span><b>' + won(Math.round(tot / 10000)) + '만</b><i>목표 ' + (goal ? won(Math.round(goal / 10000)) + "만 · " + Math.round(tot / goal * 100) + "%" : "미입력") + "</i></div>" +
      '<div class="card kpi"><span>진행중 주문서 · 납품 대기</span><b>' + pend.length + " · " + ldl.length + "</b><i>이카운트 · 청담리온</i></div></div>" +
      '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>오늘 · 이번 주 일정</h3>' + (calToday.concat(next).slice(0, 14).map(function (c) { return '<div class="row"><div class="tm">' + esc(c.d.slice(5)) + " " + dow(c.d) + "<br>" + esc(c.t) + '</div><div>' + (c.h ? '<span class="bd h">' + esc(c.h) + "</span>" : "") + esc(c.title) + "</div></div>"; }).join("") || '<div class="mut">일정 없음</div>') + "</div>" +
      '<div class="card"><h3>마감 임박 · 우선 할 일</h3>' + (td.sort(function (a, b) { return (a.due || "9").localeCompare(b.due || "9"); }).slice(0, 10).map(function (t) { return '<div class="row"><div class="tm">' + esc(t.due ? t.due.slice(5) : "-") + "</div><div>" + (t.h ? '<span class="bd h">' + esc(t.h) + "</span>" : "") + '<span class="bd t-' + esc(t.c) + '">' + esc(t.c) + "</span>" + esc(t.t) + "</div></div>"; }).join("") || '<div class="mut">할 일 없음</div>') + "</div></div>" +
      '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>사용분 알림 (최근 14일, 가납창고 *_사용분)</h3>' + (usage.slice(0, 10).map(function (o) { return '<div class="row"><div class="tm">' + esc(o.d.slice(5)) + '</div><div><span class="bd h">' + esc(o.h || "기타") + '</span><span class="bd t-' + esc(o.type) + '">' + esc(o.type) + "</span>" + esc(o.item) + ' <span class="mut">' + esc(o.st) + "</span></div></div>"; }).join("") || '<div class="mut">최근 사용분 주문서 없음</div>') + "</div>" +
      '<div class="card"><h3>최근 일지 · 발송</h3>' + recent.map(function (e) { return evRow(e, true); }).join("") + "</div></div>";
  }

  function vJournal() {
    var evs = D.events.filter(evMatch);
    var byDate = {};
    evs.forEach(function (e) { (byDate[e.d] = byDate[e.d] || []).push(e); });
    var dates = Object.keys(byDate).sort().reverse();
    if (!S.date || !byDate[S.date]) S.date = dates[0] || TODAY;
    var cur = (byDate[S.date] || []).sort(function (a, b) { return (a.t || "99").localeCompare(b.t || "99"); });
    var groups = {};
    cur.forEach(function (e) { (groups[hOf(e)] = groups[hOf(e)] || []).push(e); });
    return '<h2>영업 일지<small>날짜별 · 병원별</small></h2><div class="tools">' + hSelect(S.h, "fh") + '<input class="f" id="fq" placeholder="검색" value="' + esc(S.q) + '"><input class="f" type="date" id="fd" value="' + esc(S.date) + '"></div>' + chipsUI(TYPES, S.ty, "ty") +
      '<div class="lay"><div class="card side">' + dates.slice(0, 120).map(function (d) { return '<div class="si' + (d === S.date ? " on" : "") + '" data-date="' + d + '"><div>' + d.slice(5) + " (" + dow(d) + ")</div><span>" + byDate[d].length + "</span></div>"; }).join("") + "</div>" +
      '<div><h3>' + esc(S.date) + " (" + dow(S.date) + ") · " + cur.length + "건</h3>" + (Object.keys(groups).sort().map(function (h) { return '<div class="card" style="margin-bottom:12px"><h3>' + esc(h) + " <span class='mut'>" + groups[h].length + "</span></h3>" + groups[h].map(function (e) { return evRow(e, false); }).join("") + "</div>"; }).join("") || '<div class="card mut">이 날짜에는 기록이 없어요.</div>') + "</div></div>";
  }

  function itemAgg(h) {
    var m = {};
    D.lines.forEach(function (l) { if ((l.h || "기타") !== h) return; var k = l.code || l.item; var o = m[k] = m[k] || { item: l.item, code: l.code, q: 0, n: 0, last: "", by: {}, rows: [] }; o.q += l.q; o.n++; if (l.d > o.last) o.last = l.d; var t = l.type || "-"; o.by[t] = (o.by[t] || 0) + l.q; o.rows.push(l); });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.last.localeCompare(a.last); });
  }
  function vHosp() {
    var hs = hospList();
    if (!S.hsel) S.hsel = hs[0];
    var cnt = function (h) { return D.events.filter(function (e) { return hOf(e) === h; }).length; };
    var h = S.hsel;
    var tabs = [["time", "타임라인"], ["items", "입고 제품(이카운트)"], ["docs", "서류"], ["plan", "일정 · 할 일"]];
    var body = "";
    if (S.htab === "time") {
      var evs = D.events.filter(function (e) { return hOf(e) === h && (!S.from || e.d >= S.from) && (!S.to || e.d <= S.to) && (!S.ty.length || (e.ty || []).some(function (t) { return S.ty.indexOf(t) >= 0; })) && (!S.q || (e.title + " " + (e.sum || "")).toLowerCase().indexOf(S.q.toLowerCase()) >= 0); }).sort(function (a, b) { return (b.d + b.t).localeCompare(a.d + a.t); });
      var last = "";
      body = '<div class="tools"><input class="f" type="date" id="ff" value="' + esc(S.from) + '"> ~ <input class="f" type="date" id="ft" value="' + esc(S.to) + '"><input class="f" id="fq" placeholder="검색" value="' + esc(S.q) + '"></div>' + chipsUI(TYPES, S.ty, "ty") +
        '<div class="card">' + (evs.slice(0, 400).map(function (e) { var hd = ""; if (e.d !== last) { last = e.d; hd = '<div style="margin:14px 0 4px;color:var(--ac);font-weight:800">' + e.d + " (" + dow(e.d) + ")</div>"; } return hd + evRow(e, false); }).join("") || '<div class="mut">기록 없음</div>') + "</div>";
    } else if (S.htab === "items") {
      var ag = itemAgg(h).filter(function (o) { return !S.itemq || (o.item + " " + o.code).toLowerCase().indexOf(S.itemq.toLowerCase()) >= 0; });
      body = '<div class="note">이카운트 주문서 라인 기준(2026-08-03 이후)입니다. 병원이 식별되는 주문서 위주이고, 10/13 이전 가납창고 주문서는 병원명이 없어 빠질 수 있어요.</div><div class="tools"><input class="f" id="fiq" style="min-width:260px" placeholder="제품명·코드 검색" value="' + esc(S.itemq) + '"><span class="mut">' + ag.length + "개 품목</span></div>" +
        '<div class="card" style="overflow:auto"><table><thead><tr><th>제품</th><th>코드</th><th class="n">수량</th><th class="n">건</th><th>구분별</th><th>최근</th></tr></thead><tbody>' + ag.map(function (o, i) { return '<tr data-itm="' + i + '" style="cursor:pointer"><td>' + esc(o.item) + "</td><td>" + esc(o.code) + '</td><td class="n">' + o.q + '</td><td class="n">' + o.n + "</td><td>" + Object.keys(o.by).map(function (t) { return '<span class="bd t-' + esc(t) + '">' + esc(t) + " " + o.by[t] + "</span>"; }).join("") + "</td><td>" + esc(o.last.slice(5)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      S._ag = ag;
    } else if (S.htab === "docs") {
      body = docsGrid(D.docs.filter(function (d) { return (d.h || "기타") === h; }));
    } else {
      var ce = D.cal.filter(function (c) { return (c.h || "기타") === h && !c.rec; }).sort(function (a, b) { return b.d.localeCompare(a.d); });
      var tl = todos().filter(function (t) { return (t.h || "기타") === h; });
      body = '<div class="grid g2"><div class="card"><h3>일정</h3>' + (ce.slice(0, 40).map(function (c) { return '<div class="row"><div class="tm">' + esc(c.d.slice(5)) + " " + dow(c.d) + "<br>" + esc(c.t) + "</div><div>" + esc(c.title) + "</div></div>"; }).join("") || '<div class="mut">일정 없음</div>') + '</div><div class="card"><h3>할 일</h3>' + (tl.map(todoRow).join("") || '<div class="mut">할 일 없음</div>') + "</div></div>";
    }
    var ords = D.orders.filter(function (o) { return (o.h || "기타") === h; });
    return '<h2>병원별<small>17개 담당 병원 + 기타</small></h2><div class="lay"><div class="card side">' + hs.map(function (x) { return '<div class="si' + (x === h ? " on" : "") + '" data-h="' + esc(x) + '"><div>' + esc(x) + "</div><span>" + cnt(x) + "</span></div>"; }).join("") + "</div><div>" +
      '<div class="grid g3" style="margin-bottom:12px"><div class="card kpi"><span>이카운트 주문서(10/13~)</span><b>' + ords.length + '</b></div><div class="card kpi"><span>입고 품목 종류</span><b>' + itemAgg(h).length + '</b></div><div class="card kpi"><span>마지막 활동</span><b style="font-size:20px">' + esc((D.events.filter(function (e) { return hOf(e) === h; }).map(function (e) { return e.d; }).sort().pop()) || "-") + "</b></div></div>" +
      '<div class="chips">' + tabs.map(function (t) { return '<span class="chip' + (S.htab === t[0] ? " on" : "") + '" data-htab="' + t[0] + '">' + t[1] + "</span>"; }).join("") + "</div>" + body + "</div></div>";
  }

  function vCal() {
    var y = +S.cm.slice(0, 4), m = +S.cm.slice(5, 7) - 1, first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
    var evMap = {};
    var add = function (d, o) { (evMap[d] = evMap[d] || []).push(o); };
    D.cal.forEach(function (c) { if (!S.h || (c.h || "기타") === S.h) add(c.d, { t: c.t + " " + c.title, c: c.rec ? "rec" : "", h: c.h }); });
    todos().forEach(function (t) { if (t.due && !t.done && (!S.h || (t.h || "기타") === S.h)) add(t.due, { t: "할 일: " + t.t, c: "td", h: t.h }); });
    (D.lion && D.lion.deliveries || []).forEach(function (d) { if (!S.h || S.h === "청담리온정형외과") add(d.date, { t: "리온 " + (d.title || "납품"), c: "dl", h: "청담리온정형외과" }); });
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), ds = ymd(d), es = evMap[ds] || [];
      cells += '<div class="dc' + (d.getMonth() !== m ? " out" : "") + (ds === TODAY ? " today" : "") + (ds === S.cd ? " sel" : "") + '" data-cd="' + ds + '"><div class="dn">' + d.getDate() + "</div>" + es.slice(0, 4).map(function (e) { return '<div class="ev ' + e.c + '">' + esc(e.t) + "</div>"; }).join("") + (es.length > 4 ? '<div class="mut" style="font-size:11px">+' + (es.length - 4) + "</div>" : "") + "</div>";
    }
    var sel = evMap[S.cd] || [];
    var ords = D.orders.filter(function (o) { return o.d === S.cd && (!S.h || (o.h || "기타") === S.h); });
    return '<h2>캘린더<small>네이버웍스 일정 동기화 · 할 일 · 리온 납품</small></h2><div class="tools"><button class="btn g" data-cm="-1">◀</button><b style="font-size:17px">' + y + "년 " + (m + 1) + '월</b><button class="btn g" data-cm="1">▶</button><button class="btn g" data-cm="0">오늘</button>' + hSelect(S.h, "fh") + '<span class="mut">동기화 시점 ' + esc((D.built || "").slice(0, 16).replace("T", " ")) + "</span></div>" +
      '<div class="cal">' + DOW.map(function (x) { return '<div class="dh">' + x + "</div>"; }).join("") + cells + "</div>" +
      '<div class="card" style="margin-top:14px"><h3>' + S.cd + " (" + dow(S.cd) + ")</h3>" + (sel.map(function (e) { return '<div class="row"><div>' + (e.h ? '<span class="bd h">' + esc(e.h) + "</span>" : "") + esc(e.t) + "</div></div>"; }).join("") || '<div class="mut">일정 없음</div>') + (ords.length ? '<h3 style="margin-top:12px">이카운트 주문서 ' + ords.length + "건</h3>" + ords.map(function (o) { return '<div class="row"><div><span class="bd h">' + esc(o.h || "기타") + '</span><span class="bd t-' + esc(o.type) + '">' + esc(o.type) + "</span>" + esc(o.no + " · " + o.item) + "</div></div>"; }).join("") : "") + "</div>";
  }

  function todoRow(t) {
    return '<div class="todo' + (t.done ? " done" : "") + '"><input type="checkbox" data-td="' + t.id + '"' + (t.done ? " checked" : "") + '><div class="tt">' + (t.h ? '<span class="bd h">' + esc(t.h) + "</span>" : "") + '<span class="bd t-' + esc(t.c) + '">' + esc(t.c) + "</span>" + esc(t.t) + "</div><div class='mut'>" + esc(t.due ? t.due.slice(5) : "") + ' <span class="x" data-tdel="' + t.id + '">✕</span></div></div>';
  }
  function vTodo() {
    var all = todos().filter(function (t) { return (!S.h || (t.h || "기타") === S.h) && (!S.ty.length || S.ty.indexOf(t.c) >= 0); });
    all.sort(function (a, b) { return (a.done - b.done) || (a.due || "9").localeCompare(b.due || "9"); });
    return '<h2>할 일<small>납품 · 데모 · 수리 · 교환 · 견적서 · 서류등록</small></h2><div class="card" style="margin-bottom:14px"><div class="tools" style="margin:0"><input class="f" id="nt" style="flex:1;min-width:220px" placeholder="새 할 일"><select class="f" id="nh"><option value="">병원 선택</option>' + hospList().map(function (h) { return "<option>" + esc(h) + "</option>"; }).join("") + '</select><select class="f" id="nc">' + CATS.map(function (c) { return "<option>" + c + "</option>"; }).join("") + '</select><input class="f" type="date" id="nd"><button class="btn" id="na">추가</button></div></div>' +
      '<div class="tools">' + hSelect(S.h, "fh") + "</div>" + chipsUI(CATS, S.ty, "ty") + '<div class="card">' + (all.map(todoRow).join("") || '<div class="mut">할 일 없음</div>') + "</div>";
  }

  function vTarget() {
    var months = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], tg = ls("lab_target", {});
    var rows = D.hospitals.map(function (h) {
      return "<tr><td><b>" + esc(h) + "</b></td>" + months.map(function (m) { var g = +(tg[h + "|" + m] || 0), a = sales(h, m), p = g ? Math.min(100, Math.round(a / g * 100)) : 0; return '<td><input class="f" style="width:96px" inputmode="numeric" data-tg="' + esc(h + "|" + m) + '" value="' + (g ? won(g) : "") + '" placeholder="목표(원)"><div class="mut" style="margin-top:3px">실적 ' + (a ? won(Math.round(a / 10000)) + "만" : "-") + (g ? " · " + Math.round(a / g * 100) + "%" : "") + '</div><div class="bar2"><i style="width:' + p + '%"></i></div></td>'; }).join("") + "</tr>";
    }).join("");
    var tot = months.map(function (m) { var g = 0, a = 0; D.hospitals.forEach(function (h) { g += +(tg[h + "|" + m] || 0); a += sales(h, m); }); return "<td><b>" + won(Math.round(a / 10000)) + "만</b><div class='mut'>목표 " + (g ? won(Math.round(g / 10000)) + "만" : "-") + "</div></td>"; }).join("");
    return '<h2>월별 병원별 매출 목표<small>목표는 직접 입력(이 기기에 저장) · 실적은 이카운트 주문서 금액(VAT 포함) 기준</small></h2><div class="note">목표 금액은 원 단위로 입력해요. 입력한 값은 이 브라우저에 저장되고, 아래 버튼으로 복사해 두면 다른 기기에서도 쓸 수 있어요.</div><div class="tools"><button class="btn g" id="tgx">목표 JSON 복사</button><button class="btn g" id="tgi">목표 JSON 붙여넣기</button></div><div class="card" style="overflow:auto"><table><thead><tr><th>병원</th>' + months.map(function (m) { return "<th>" + m.slice(5) + "월</th>"; }).join("") + "</tr></thead><tbody>" + rows + "<tr><td><b>합계</b></td>" + tot + "</tr></tbody></table></div>";
  }

  function dealerCard() {
    var a = D.dealers || [];
    if (!a.length) return "";
    return '<div class="card" style="margin-bottom:12px"><h3>간납사 알림 · 입고 대기<small class="mut"> ' + esc(D.dealerAt || "") + ' 기준</small></h3>' + a.map(function (x) { return '<div class="row"><div style="flex:1"><b>' + esc(x.src) + " · " + esc(x.loc) + "</b> " + (x.h ? '<span class="bd h">' + esc(x.h) + "</span>" : "") + '<div class="mut">' + esc(x.d) + " · 발주 " + esc(x.no) + " · " + esc(x.item) + " · " + esc(x.q) + 'EA</div></div><span class="bd" style="color:var(--warn);border-color:#7a5a1d">' + esc(x.st) + "</span></div>"; }).join("") + "</div>";
  }
  function vDeliv() {
    var ty = S.dty, os = D.orders.filter(function (o) { return (!S.dh || (o.h || "기타") === S.dh) && (!ty || o.type === ty); });
    var cnt = {};
    D.orders.forEach(function (o) { cnt[o.type] = (cnt[o.type] || 0) + 1; });
    var types = ["선납", "판매", "마감", "가납", "가납랜딩", "교환", "샘플"];
    var srcs = [["이카운트 주문서", "연결됨", "이 화면의 주문서 · 입고 제품"], ["청담리온 납품 사이트", "연결됨", "청담리온 탭 · 납품 상태"], ["네이버웍스 캘린더·메일", "연결됨", "캘린더 · 일지"], ["스마트엠케어(고대 3곳)", "연결됨", "발주·입고대기 자동 수집"], ["케어캠프/스마트빌(강북삼성)", "연결 예정", "발주·납품등록"], ["이지메디컴(서울대)", "연결 예정", "견적·발주"], ["토탈메디칼(노원을지)", "연결 예정", "발주"], ["텔레그램 · 통화 녹음", "연결 예정", "사용분·요청 전사"]];
    var h2html = '<h2>납품 · 간납사<small>선납 · 판매 · 가납랜딩 · 교환 · 샘플</small></h2><div class="grid g21"><div><div class="tools">' + hSelect(S.dh, "dhs") + '</div><div class="chips"><span class="chip' + (ty ? "" : " on") + '" data-dty="">전체 ' + D.orders.length + "</span>" + types.map(function (t) { return '<span class="chip' + (ty === t ? " on" : "") + '" data-dty="' + t + '">' + t + " " + (cnt[t] || 0) + "</span>"; }).join("") + '</div><div class="card" style="overflow:auto"><table><thead><tr><th>일자-No.</th><th>병원 / 거래처</th><th>구분</th><th>품목</th><th class="n">금액</th><th>상태</th></tr></thead><tbody>' + os.slice(0, 250).map(function (o) { return "<tr><td>" + esc(o.no) + "</td><td>" + (o.h ? '<span class="bd h">' + esc(o.h) + "</span>" : "") + esc(o.hosp || o.dealer) + '</td><td><span class="bd t-' + esc(o.type) + '">' + esc(o.type) + "</span></td><td>" + esc(o.item) + '</td><td class="n">' + (o.amt ? won(o.amt) : "") + "</td><td>" + esc(o.st) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
    srcs = srcs.map(function (s) { var o = D.srcState && D.srcState[s[0]]; return o ? [s[0], o[0], o[1]] : s; });
    return h2html + '<div>' + dealerCard() + '<div class="card"><h3>데이터 소스 연결 상태</h3>' + srcs.map(function (s) { return '<div class="row"><div style="flex:1"><b>' + esc(s[0]) + '</b><div class="mut">' + esc(s[2]) + '</div></div><span class="bd" style="' + (s[1] === "연결됨" ? "color:var(--ok);border-color:#1f6b52" : "color:var(--warn);border-color:#7a5a1d") + '">' + s[1] + "</span></div>"; }).join("") + '</div><div class="note" style="margin-top:12px">간납사 사이트는 일일 갱신 때 로그인되어 있는 곳부터 읽어 와요. 읽지 못한 곳은 위 상태에 이유가 표시돼요.</div></div></div>';
  }

  function docsGrid(list) {
    var q = S.docq.toLowerCase();
    list = list.filter(function (d) { return (!q || d.n.toLowerCase().indexOf(q) >= 0) && (!S.docty || (d.ty || []).indexOf(S.docty) >= 0); }).sort(function (a, b) { return b.d.localeCompare(a.d); });
    return '<div class="tools"><input class="f" id="dq" placeholder="서류 검색" value="' + esc(S.docq) + '"><select class="f" id="dty"><option value="">전체 종류</option>' + ["견적서", "서류등록", "선납", "판매", "납품", "교환", "수리", "데모"].map(function (t) { return "<option" + (S.docty === t ? " selected" : "") + ">" + t + "</option>"; }).join("") + '</select><span class="mut">' + list.length + '건 · 클릭하면 미리보기</span></div><div class="docs">' + list.slice(0, 300).map(function (d, i) { var ok = D.docEnc && D.docEnc[d.n] || d.u; return '<div class="doc" data-doc="' + esc(d.n) + '"><span class="bd h">' + esc(d.h || "기타") + '</span><span class="bd">' + esc(d.d.slice(5)) + "</span>" + ((d.ty || []).slice(0, 2).map(function (t) { return '<span class="bd t-' + esc(t) + '">' + esc(t) + "</span>"; }).join("")) + '<div class="nm">' + esc(d.n) + '</div><div class="mut">' + (ok ? "미리보기 가능" : "미리보기 없음 · " + esc(d.ext)) + "</div></div>"; }).join("") + "</div>";
  }
  function vDocs() { return '<h2>서류<small>발송·작성한 서류 미리보기</small></h2><div class="tools">' + hSelect(S.dh, "dhs") + "</div>" + docsGrid(D.docs.filter(function (d) { return !S.dh || (d.h || "기타") === S.dh; })); }

  var LC = { C65: ["#e3f2ff", "#2f7fd1"], C80: ["#d3e6ff", "#1f5fb3"], SP: ["#efe9ff", "#7a56e0"], S3: ["#e2f8ef", "#1f9a70"], S2: ["#d9f5f3", "#13897f"], S1: ["#fff0e5", "#d9692a"], ND: ["#ffe3ec", "#d9457b"], AFF: ["#fff8d6", "#a88100"], TT: ["#ffe8d9", "#c6531a"] };
  var LS = { C65: "캐뉼라 6.5", C80: "캐뉼라 8.0", SP: "Speed", S3: "3 Strands", S2: "2 Strands", S1: "1 Strands", ND: "Needles", AFF: "Alphavent", TT: "XBraid TT" };
  function vLion() {
    var L = D.lion || {}, st = (L.state && L.state.deliveries) || {}, dl = (L.deliveries || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var chip = function (c, q) { var k = LC[c] || ["#eee", "#333"]; return '<span class="lchip" style="background:' + k[0] + ";color:" + k[1] + '">' + (LS[c] || c) + (q != null ? " <b>" + q + "</b>" : "") + "</span>"; };
    return '<h2>청담리온<small>납품 사이트 연동 · <a style="color:var(--ac)" target="_blank" href="https://cesceo.github.io/lion-sumex/">사이트 열기</a></small></h2>' + dl.map(function (d) { var s = st[d.id] || (d.fixed || {}), done = s.status === "done"; return '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(d.title || d.date + " 납품") + '</b><span class="bd" style="' + (done ? "color:var(--ok);border-color:#1f6b52" : "color:var(--warn);border-color:#7a5a1d") + '">' + (done ? "납품 완료 " + esc(s.at || "") : "납품 대기") + "</span></div>" + d.patients.map(function (p) { return '<div class="row"><div class="tm">' + esc(p.date.slice(5)) + '</div><div><b>' + esc(p.name) + '</b> <span class="mut">' + esc(p.chart) + '</span><div>' + p.lines.map(function (l) { return chip(l[0], l[1]); }).join("") + "</div></div></div>"; }).join("") + ((d.extra || []).length ? '<div class="row"><div class="tm">추가</div><div>' + d.extra.map(function (x) { return '<span class="bd t-' + (x.kind === "교환" ? "교환" : "가납랜딩") + '">' + esc(x.kind) + "</span>" + chip(x.p, x.qty) + esc(x.note || ""); }).join("<br>") + "</div></div>" : "") + "</div>"; }).join("");
  }

  /* ---------- modal / docs ---------- */
  function openDoc(name) {
    var d = D.docs.filter(function (x) { return x.n === name; })[0];
    if (!d) return;
    var enc = D.docEnc && D.docEnc[name], ext = (d.ext || "").toLowerCase();
    $("#mt").textContent = name;
    var show = function (url) { $("#mb").innerHTML = ext === "pdf" ? '<iframe src="' + url + '"></iframe>' : '<img src="' + url + '">'; $("#modal").classList.add("on"); };
    if (enc) {
      $("#mb").innerHTML = '<div style="margin:auto" class="mut">불러오는 중...</div>'; $("#modal").classList.add("on");
      fetch(enc).then(function (r) { return r.arrayBuffer(); }).then(decBuf).then(function (pt) { show(URL.createObjectURL(new Blob([pt], { type: ext === "pdf" ? "application/pdf" : "image/" + (ext === "jpg" ? "jpeg" : ext) }))); }).catch(function () { $("#mb").innerHTML = '<div style="margin:auto" class="mut">열 수 없어요</div>'; });
    } else if (d.u && !KEY) { show(d.u); } else { alert("이 서류는 미리보기가 없어요: " + (d.ext || "").toUpperCase() + " 파일 · 로컬 폴더에서 열어 주세요."); }
  }

  /* ---------- render & events ---------- */
  function vClinic() {
    var C = D.clinic || { doctors: [], coverage: {} }, all = C.doctors || [];
    var hs = []; all.forEach(function (x) { if (hs.indexOf(x.h) < 0) hs.push(x.h); }); Object.keys(C.coverage || {}).forEach(function (h) { if (hs.indexOf(h) < 0) hs.push(h); }); hs.sort();
    var hsel = S.ch || "", dsel = S.cdd || TODAY, dep = S.cdep || "", q = (S.cq || "").trim().toLowerCase(), w = DOW[new Date(dsel + "T00:00:00").getDay()];
    var deps = []; all.forEach(function (x) { if ((!hsel || x.h === hsel) && deps.indexOf(x.dept) < 0) deps.push(x.dept); }); deps.sort();
    var drs = all.filter(function (x) { return (!hsel || x.h === hsel) && (!dep || x.dept === dep) && (!q || (x.dr + " " + (x.spec || "") + " " + x.h + " " + x.dept).toLowerCase().indexOf(q) >= 0); });
    var on = drs.filter(function (x) { return x.slots && x.slots[w]; });
    var wk = []; var base = new Date(dsel + "T00:00:00"); for (var i = 0; i < 7; i++) { wk.push(new Date(base.getTime() + (i - ((base.getDay() + 6) % 7)) * 864e5)); }
    var slot = function (v) { return v === "AM" ? "오전" : v === "PM" ? "오후" : v === "AM+PM" ? "종일" : v; };
    var known = drs.filter(function (x) { return x.slots && Object.keys(x.slots).length; }).length;
    var byH = {}; on.forEach(function (x) { (byH[x.h] = byH[x.h] || []).push(x); });
    var covHtml = hs.map(function (h) { var n = all.filter(function (x) { return x.h === h; }).length; return '<div class="row" style="cursor:pointer" data-chh="' + esc(h) + '"><div class="tm">' + n + '명</div><div><b>' + esc(h) + '</b><div class="sum">' + esc((C.coverage || {})[h] || "미수집") + "</div></div></div>"; }).join("");
    return '<h2>외래일정<small>거래처 병원 · 과 · 의사별 외래진료 조회 (홈페이지 주간 시간표 기준)</small></h2>' +
      '<div class="note">각 병원 홈페이지의 주간 외래 시간표를 모아 날짜에 맞춰 보여줘요. 휴진·격주·학회·대진은 반영되지 않으니 방문 전 병원에 확인하세요. 수집일 ' + esc(C.checked || "") + ' · 병원 ' + hs.length + '곳 · 의료진 ' + all.length + '명</div>' +
      '<div class="tools"><select class="f" id="chs"><option value="">전체 병원</option>' + hs.map(function (h) { return "<option" + (h === hsel ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + '</select>' +
      '<select class="f" id="cdep"><option value="">전체 과</option>' + deps.map(function (d) { return "<option" + (d === dep ? " selected" : "") + ">" + esc(d) + "</option>"; }).join("") + '</select>' +
      '<input class="f" id="cq" placeholder="의사명·전문분야 검색" value="' + esc(S.cq || "") + '"><input class="f" type="date" id="cdd" value="' + esc(dsel) + '">' + (hsel ? '<span class="bd">' + esc((C.coverage || {})[hsel] || "미수집") + "</span>" : "") + "</div>" +
      '<div class="card" style="margin-bottom:12px"><h3>' + esc(dsel) + " (" + w + ") 외래 진료 · " + on.length + "명</h3>" +
      (Object.keys(byH).sort().map(function (h) { return '<div class="mut" style="margin:10px 0 4px;font-weight:700">' + esc(h) + "</div>" + byH[h].map(function (x) { return '<div class="row"><div class="tm">' + slot(x.slots[w]) + "</div><div><b>" + esc(x.dr) + "</b> " + (x.title ? '<span class="mut">' + esc(x.title) + "</span> " : "") + '<span class="mut">· ' + esc(x.dept) + (x.note ? " · " + esc(x.note) : "") + '</span><div class="sum">' + esc(x.spec || "") + "</div></div></div>"; }).join(""); }).join("") || '<div class="mut">' + (drs.length ? "선택한 날짜에 외래가 확인된 의료진이 없어요." : "조건에 맞는 의료진이 없어요.") + "</div>") + "</div>" +
      '<div class="card" style="overflow:auto;margin-bottom:12px"><h3>주간 외래표 · ' + drs.length + "명 (요일 확인 " + known + "명)</h3><table><thead><tr>" + (hsel ? "" : "<th>병원</th>") + "<th>과</th><th>의료진</th>" + ["월", "화", "수", "목", "금", "토"].map(function (d, i) { return "<th" + (d === w ? ' style="background:#e8f1ff"' : "") + ">" + d + '<br><span class="mut">' + (wk[i].getMonth() + 1) + "/" + wk[i].getDate() + "</span></th>"; }).join("") + "<th>전문분야</th></tr></thead><tbody>" +
      drs.map(function (x) { return "<tr>" + (hsel ? "" : "<td>" + esc(x.h) + "</td>") + "<td>" + esc(x.dept) + "</td><td><b>" + esc(x.dr) + "</b>" + (x.title ? '<div class="mut">' + esc(x.title) + "</div>" : "") + "</td>" + ["월", "화", "수", "목", "금", "토"].map(function (d) { return "<td>" + (x.slots && x.slots[d] ? '<span class="bd t-데모">' + slot(x.slots[d]) + "</span>" : "") + "</td>"; }).join("") + '<td class="mut" style="font-size:12px">' + esc(x.spec || "") + (x.note ? "<br>" + esc(x.note) : "") + (x.src ? '<br><a href="' + esc(/^https?:/.test(x.src) ? x.src : "https://" + x.src) + '" target="_blank" rel="noopener">출처</a>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="card"><h3>병원별 수집 현황</h3>' + covHtml + "</div>";
  }
  var VIEWS = { dash: vDash, journal: vJournal, hosp: vHosp, cal: vCal, todo: vTodo, target: vTarget, deliv: vDeliv, docs: vDocs, lion: vLion, clinic: vClinic };
  function render() {
    $("#nav").innerHTML = NAVS.map(function (n) { return '<button data-v="' + n[0] + '" class="' + (S.view === n[0] ? "on" : "") + '">' + n[1] + "</button>"; }).join("");
    $("#main").innerHTML = VIEWS[S.view]() + '<div class="foot"><span><i>AI</i> SUMEX <b>최은성의 AI SALES LAB</b></span><div class="mut" style="margin-top:8px;font-size:12px">데이터 기준 ' + esc((D.built || "").slice(0, 16).replace("T", " ")) + "</div></div>";
  }
  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-chh],[data-v],[data-ch],[data-date],[data-h],[data-htab],[data-cd],[data-cm],[data-doc],[data-more],[data-dty],[data-itm],[data-tdel],#na,#tgx,#tgi");
      if (!t) return;
      if (t.dataset.chh) { S.ch = t.dataset.chh; S.cdep = ""; render(); window.scrollTo(0, 0); return; }
      if (t.dataset.v) { S.view = t.dataset.v; S.ty = []; S.q = ""; render(); window.scrollTo(0, 0); }
      else if (t.dataset.ch) { var v = t.dataset.v, i = S.ty.indexOf(v); if (i >= 0) S.ty.splice(i, 1); else S.ty.push(v); render(); }
      else if (t.dataset.date) { S.date = t.dataset.date; render(); }
      else if (t.dataset.h) { S.hsel = t.dataset.h; S.itemq = ""; render(); }
      else if (t.dataset.htab) { S.htab = t.dataset.htab; render(); }
      else if (t.dataset.cd) { S.cd = t.dataset.cd; render(); }
      else if (t.dataset.cm != null) { var n = +t.dataset.cm; if (n === 0) { S.cm = TODAY.slice(0, 7); S.cd = TODAY; } else { var y = +S.cm.slice(0, 4), m = +S.cm.slice(5, 7) - 1 + n; var d = new Date(y, m, 1); S.cm = d.getFullYear() + "-" + pad(d.getMonth() + 1); } render(); }
      else if (t.dataset.doc) openDoc(t.dataset.doc);
      else if (t.dataset.more) { var ev = D.events.filter(function (x) { return x.id === t.dataset.more; })[0]; var el = document.querySelector('[data-sum="' + t.dataset.more + '"]'); if (ev && el) { el.textContent = ev.full; t.remove(); } }
      else if (t.dataset.dty != null) { S.dty = t.dataset.dty; render(); }
      else if (t.dataset.itm != null) { var o = S._ag[+t.dataset.itm]; if (o) alert(o.item + " (" + o.code + ")\n" + o.rows.map(function (r) { return r.d + "  " + r.no + "  " + r.q + "개  " + (r.type || "-") + "  " + (r.hosp || r.dealer); }).join("\n")); }
      else if (t.dataset.tdel) { var st = ls("lab_todo", { done: {}, del: {}, custom: [] }); st.del[t.dataset.tdel] = 1; ss("lab_todo", st); render(); }
      else if (t.id === "na") { var tx = $("#nt").value.trim(); if (!tx) return; var st2 = ls("lab_todo", { done: {}, del: {}, custom: [] }); st2.custom.push({ id: "C" + Date.now(), t: tx, h: $("#nh").value, c: $("#nc").value, due: $("#nd").value }); ss("lab_todo", st2); render(); }
      else if (t.id === "tgx") { var txt = JSON.stringify(ls("lab_target", {})); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { alert("복사했어요"); }, function () { prompt("복사하세요", txt); }); }
      else if (t.id === "tgi") { var inp = prompt("목표 JSON을 붙여넣으세요"); if (inp) { try { ss("lab_target", JSON.parse(inp)); render(); } catch (x) { alert("형식이 맞지 않아요"); } } }
    });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "chs") { S.ch = t.value; S.cdep = ""; render(); } else if (t.id === "cdep") { S.cdep = t.value; render(); } else if (t.id === "cdd") { S.cdd = t.value; render(); }
      else if (t.id === "fh") { S.h = t.value; render(); } else if (t.id === "dhs") { S.dh = t.value; render(); }
      else if (t.id === "fd") { S.date = t.value; render(); } else if (t.id === "ff") { S.from = t.value; render(); } else if (t.id === "ft") { S.to = t.value; render(); }
      else if (t.id === "dty") { S.docty = t.value; render(); }
      else if (t.dataset && t.dataset.td) { var st = ls("lab_todo", { done: {}, del: {}, custom: [] }); st.done[t.dataset.td] = t.checked ? 1 : 0; ss("lab_todo", st); render(); }
      else if (t.dataset && t.dataset.tg) { var tg = ls("lab_target", {}); var v = +String(t.value).replace(/[^\d]/g, ""); if (v) tg[t.dataset.tg] = v; else delete tg[t.dataset.tg]; ss("lab_target", tg); render(); }
    });
    document.addEventListener("input", function (e) {
      var t = e.target, f = null;
      if (t.id === "fq") { S.q = t.value; f = "fq"; } else if (t.id === "fiq") { S.itemq = t.value; f = "fiq"; } else if (t.id === "dq") { S.docq = t.value; f = "dq"; } else if (t.id === "cq") { S.cq = t.value; f = "cq"; }
      if (f) { var pos = t.selectionStart; render(); var el = document.getElementById(f); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} } }
    });
  }
  window.LAB = { closeModal: function () { $("#modal").classList.remove("on"); $("#mb").innerHTML = ""; } };

  function start(data) {
    D = data; D.cal = D.cal || []; D.orders = D.orders || []; D.lines = D.lines || []; D.docs = D.docs || [];
    $("#gate").style.display = "none"; bind(); render();
  }
  function boot() {
    if (window.LAB_PLAIN) { start(window.LAB_PLAIN); return; }
    var tryPass = function (p, silent) {
      return unlock(p).then(function (d) { try { localStorage.setItem("lab_pass", p); } catch (e) {} start(d); }).catch(function () { if (!silent) $("#err").textContent = "코드가 맞지 않아요."; $("#gate").style.display = "flex"; });
    };
    $("#go").onclick = function () { tryPass($("#pw").value.trim(), false); };
    $("#pw").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#go").click(); });
    var saved = null; try { saved = localStorage.getItem("lab_pass"); } catch (e) {}
    if (saved) tryPass(saved, true);
  }
  boot();
})();
