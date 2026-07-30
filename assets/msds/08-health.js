/* =========================================================
   [6] ⑤ 특수건강진단
   ========================================================= */
let healths = JSON.parse(localStorage.getItem('pfm_healths') || 'null');
if(!healths){
    healths = [
        {dept:'양극재제조부',name:'홍길동',age:28,gender:'남',date:'2025-03-22',sbp:110,dbp:70,glucose:91,tg:206,ldl:61.8,elder:'',consent:'○',note:''},
        {dept:'전구체제조부',name:'김철수',age:60,gender:'남',date:'2025-03-12',sbp:104,dbp:74,glucose:103,tg:92,ldl:150.6,elder:'○',consent:'○',note:''},
        {dept:'음극재제조부',name:'이영희',age:59,gender:'남',date:'2025-07-29',sbp:114,dbp:64,glucose:100,tg:206,ldl:108.8,elder:'',consent:'○',note:''}
    ];
    saveHealthLS();
}
function saveHealthLS(){ localStorage.setItem('pfm_healths', JSON.stringify(healths)); }

function calcValid(d){ if(!d) return ''; const x=new Date(d); x.setFullYear(x.getFullYear()+1); x.setDate(x.getDate()-1); return x.toISOString().slice(0,10); }
function judgeHealth(h){
    const r=[];
    if(h.sbp>160||h.sbp<90) r.push('SBP');
    if(h.dbp>100||h.dbp<50) r.push('DBP');
    if(h.glucose>126||h.glucose<70) r.push('공복혈당');
    if(h.tg>500) r.push('T.G');
    if(h.ldl>190) r.push('LDL');
    if(h.consent!=='○') r.push('개인정보동의서');
    if(h.age>=60 && h.elder!=='○') r.push('고령확인서');
    return r;
}
function isBad(v,hi,lo){ v=Number(v); return v>hi || (lo!==undefined && v<lo); }

function renderHealth(){
    const dept=document.getElementById('f5-dept').value.toLowerCase();
    const name=document.getElementById('f5-name').value.toLowerCase();
    const rf=document.getElementById('f5-result').value;
    const tbody=document.getElementById('healthBody');
    tbody.innerHTML=''; const today=new Date();
    let ok=0, bad=0, soon=0, expired=0;

    const filtered = healths.filter(h=>{
        if(dept && !(h.dept||'').toLowerCase().includes(dept)) return false;
        if(name && !(h.name||'').toLowerCase().includes(name)) return false;
        const result = judgeHealth(h).length?'부적격':'적격';
        if(rf && result!==rf) return false;
        return true;
    });

    healths.forEach(h=>{
        const reasons = judgeHealth(h);
        if(reasons.length) bad++; else ok++;
        const v = calcValid(h.date);
        if(v){ const d=Math.ceil((new Date(v)-today)/86400000); if(d<0) expired++; else if(d<30) soon++; }
    });

    filtered.forEach((h,i)=>{
        const idx = healths.indexOf(h);
        const valid = calcValid(h.date);
        const reasons = judgeHealth(h);
        const result = reasons.length?'부적격':'적격';
        const autoNote = reasons.length && !h.note ? `⚠ 복약·생활습관 개선 안내, 3개월 內 재제출 (${reasons.join(', ')})` : (h.note||'');

        tbody.innerHTML += `
            <tr data-idx="${idx}">
                <td>${i+1}</td>
                <td contenteditable="true" data-f="dept">${h.dept||''}</td>
                <td contenteditable="true" data-f="name">${h.name||''}</td>
                <td contenteditable="true" data-f="age">${h.age||''}</td>
                <td contenteditable="true" data-f="gender">${h.gender||''}</td>
                <td contenteditable="true" data-f="date">${h.date||''}</td>
                <td class="col-valid">${valid}</td>
                <td class="col-criteria">부적격기준</td>
                <td contenteditable="true" data-f="sbp" class="${isBad(h.sbp,160,90)?'val-bad':''}">${h.sbp||''}</td>
                <td contenteditable="true" data-f="dbp" class="${isBad(h.dbp,100,50)?'val-bad':''}">${h.dbp||''}</td>
                <td contenteditable="true" data-f="glucose" class="${isBad(h.glucose,126,70)?'val-bad':''}">${h.glucose||''}</td>
                <td contenteditable="true" data-f="tg" class="${isBad(h.tg,500)?'val-bad':''}">${h.tg||''}</td>
                <td contenteditable="true" data-f="ldl" class="${isBad(h.ldl,190)?'val-bad':''}">${h.ldl||''}</td>
                <td contenteditable="true" data-f="elder">${h.elder||''}</td>
                <td contenteditable="true" data-f="consent">${h.consent||''}</td>
                <td contenteditable="true" data-f="note" style="text-align:left;white-space:normal;min-width:200px">${autoNote}</td>
                <td class="${result==='적격'?'result-ok':'result-bad'}">${result}</td>
                <td><span class="row-del" onclick="delHealth(${idx})">✖</span></td>
            </tr>`;
    });

    document.getElementById('k5-total').innerHTML = healths.length+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-ok').innerHTML = ok+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-bad').innerHTML = bad+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-soon').innerHTML = soon+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-expired').innerHTML = expired+'<span class="text-xs text-gray-500"> 명</span>';

    const hdrHealth = document.getElementById('hdr-health');
    if(hdrHealth) hdrHealth.textContent = healths.length;

    document.querySelectorAll('#healthBody td[contenteditable]').forEach(td=>{
        td.onblur = ()=>{
            const idx = td.parentElement.dataset.idx;
            const f = td.dataset.f;
            let v = td.textContent.trim();
            if(['age','sbp','dbp','glucose','tg','ldl'].includes(f)) v = parseFloat(v)||0;
            healths[idx][f] = v;
            saveHealthLS(); renderHealth();
        };
        td.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); td.blur(); } };
    });
}

function addHealthRow(){
    healths.push({dept:'',name:'',age:0,gender:'',date:'',sbp:0,dbp:0,glucose:0,tg:0,ldl:0,elder:'',consent:'',note:''});
    saveHealthLS(); renderHealth();
    showToast('빈 행이 추가되었습니다. 셀을 클릭하여 편집하세요');
}
function delHealth(idx){
    if(!confirm('삭제하시겠습니까?')) return;
    healths.splice(idx,1); saveHealthLS(); renderHealth();
}

function parseReport(e){
    const file=e.target.files[0]; if(!file) return;
    showToast('📄 '+file.name+' 분석 중...');
    setTimeout(()=>{
        const names=['박민수','정수연','최지훈','강예은','윤도현','서하늘','장민재','한지수'];
        const depts=['양극재제조부','음극재제조부','전구체제조부','품질보증부'];
        const nm = names[Math.floor(Math.random()*names.length)];
        healths.push({
            dept:depts[Math.floor(Math.random()*depts.length)], name:nm,
            age:25+Math.floor(Math.random()*35),
            gender:Math.random()>0.3?'남':'여',
            date:new Date().toISOString().slice(0,10),
            sbp:100+Math.floor(Math.random()*70), dbp:60+Math.floor(Math.random()*50),
            glucose:80+Math.floor(Math.random()*60), tg:80+Math.floor(Math.random()*450),
            ldl:60+Math.floor(Math.random()*140), elder:'', consent:'○', note:''
        });
        saveHealthLS(); renderHealth();
        showToast('✅ '+nm+' 님 결과가 자동 추가되었습니다');
        e.target.value='';
    }, 1200);
}

function downloadExcel(){
    const rows = healths.map((h,i)=>{
        const r = judgeHealth(h);
        return {'구분':i+1,'부서명':h.dept,'성명':h.name,'나이':h.age,'성별':h.gender,
            '검진일':h.date,'유효기간':calcValid(h.date),
            'SBP':h.sbp,'DBP':h.dbp,'공복혈당':h.glucose,'T.G':h.tg,'LDL':h.ldl,
            '고령확인서':h.elder,'개인정보동의서':h.consent,'기타':h.note||'',
            '검토결과':r.length?'부적격':'적격'};
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '특수건강진단');
    XLSX.writeFile(wb, '특수건강진단_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('📥 엑셀 다운로드 완료');
}

function importExcel(e){
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
        const wb=XLSX.read(ev.target.result,{type:'binary'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws);
        rows.forEach(r=>{
            healths.push({
                dept:r['부서명']||'', name:r['성명']||'', age:Number(r['나이'])||0,
                gender:r['성별']||'', date:r['검진일']||'',
                sbp:Number(r['SBP'])||0, dbp:Number(r['DBP'])||0,
                glucose:Number(r['공복혈당'])||0, tg:Number(r['T.G'])||0, ldl:Number(r['LDL'])||0,
                elder:r['고령확인서']||'', consent:r['개인정보동의서']||'', note:r['기타']||''
            });
        });
        saveHealthLS(); renderHealth();
        showToast(rows.length+'건 가져오기 완료');
        e.target.value='';
    };
    reader.readAsBinaryString(file);
}
