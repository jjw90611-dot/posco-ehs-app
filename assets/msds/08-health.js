/* =========================================================
   [6] ⑤ 특수건강진단 (「안심건강 근로제」)
   ========================================================= */

// ⭐ 고정 예시 데이터
const HEALTH_EXAMPLE = {
    dept: '예시부서', name: '홍길동', birth: '1980-05-15', gender: '남',
    date: '2025-01-15', sbp: 120, dbp: 80, glucose: 95, tg: 150, ldl: 110,
    elder: '', consent: '○', note: '',
    file_report: null, file_consent: null, file_elder: null,  // ⭐ 3종 서류
    _isExample: true
};

let healths = JSON.parse(localStorage.getItem('pfm_healths') || '[]');
function saveHealthLS(){
    try {
        localStorage.setItem('pfm_healths', JSON.stringify(healths));
    } catch(e) {
        // ⭐ 파일 base64 저장으로 용량 초과 가능성 대비
        alert('⚠ 저장 공간이 부족합니다.\n오래된 파일을 삭제하거나 서버 저장소로 전환이 필요합니다.\n\n' + e.message);
    }
}

// ⭐ 만 나이 계산
function calcAge(birth, refDate){
    if(!birth) return 0;
    const b = new Date(birth);
    const r = refDate ? new Date(refDate) : new Date();
    if(isNaN(b.getTime()) || isNaN(r.getTime())) return 0;
    let age = r.getFullYear() - b.getFullYear();
    const m = r.getMonth() - b.getMonth();
    if(m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
    return age < 0 ? 0 : age;
}

// ⭐ 유효기간 (안심건강 근로제 기준: 50세↑ 1년, 70세↑ 6개월)
function calcValid(d, birth){
    if(!d) return '';
    const x = new Date(d);
    const ageAtExam = calcAge(birth, d);
    if(ageAtExam >= 70){
        x.setMonth(x.getMonth() + 6);
    } else {
        x.setFullYear(x.getFullYear() + 1);
    }
    x.setDate(x.getDate() - 1);
    return x.toISOString().slice(0,10);
}

// ⭐ 안심건강 근로제 기준 판정
function judgeHealth(h){
    const r=[];
    // 혈압: 160/100 미만, 90/50 이상
    if(h.sbp>=160 || h.sbp<90) r.push('SBP(수축기)');
    if(h.dbp>=100 || h.dbp<50) r.push('DBP(이완기)');
    // 공복혈당: 180 미만, 70 이상  ⭐ 회사 기준 (180) 반영
    if(h.glucose>=180 || h.glucose<70) r.push('공복혈당');
    // 중성지방: 500 미만
    if(h.tg>=500) r.push('T.G(중성지방)');
    // LDL: 190 미만
    if(h.ldl>=190) r.push('LDL콜레스테롤');
    // ⭐ 서류 3종 검증
    if(!h.file_report) r.push('검진결과서 미제출');
    if(h.consent !== '○' || !h.file_consent) r.push('개인정보동의서');
    const age = calcAge(h.birth, h.date);
    if(age >= 70 && (h.elder !== '○' || !h.file_elder)) r.push('고령근로자확인서');
    return r;
}
function isBad(v,hi,lo){ v=Number(v); return v>=hi || (lo!==undefined && v<lo); }

// ⭐⭐⭐ 파일 업로드 (base64 저장)
function uploadHealthFile(idx, fileType, inputEl){
    const file = inputEl.files[0];
    if(!file) return;

    // ⭐ 파일 크기 제한 (5MB)
    if(file.size > 5 * 1024 * 1024){
        alert('파일 크기는 5MB 이하만 가능합니다.\n현재: ' + (file.size/1024/1024).toFixed(2) + 'MB');
        inputEl.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        healths[idx][fileType] = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: e.target.result,  // base64
            uploadDate: new Date().toISOString().slice(0,10)
        };
        // ⭐ 동의서/고령확인서 업로드 시 자동으로 '○' 표시
        if(fileType === 'file_consent') healths[idx].consent = '○';
        if(fileType === 'file_elder') healths[idx].elder = '○';
        saveHealthLS();
        renderHealth();
        showToast('✅ ' + file.name + ' 업로드 완료');
    };
    reader.readAsDataURL(file);
}

// ⭐ 파일 보기 (새 창)
function viewHealthFile(idx, fileType){
    const isEx = idx < 0;
    const record = isEx ? HEALTH_EXAMPLE : healths[idx];
    const file = record[fileType];
    if(!file){ showToast('⚠ 파일이 없습니다'); return; }

    if(file.type && file.type.startsWith('image/')){
        // 이미지: 새 창에 표시
        const w = window.open('');
        w.document.write(`<title>${file.name}</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${file.data}" style="max-width:100%;max-height:100vh"></body>`);
    } else if(file.type === 'application/pdf'){
        // PDF: 새 창에 표시
        const w = window.open('');
        w.document.write(`<title>${file.name}</title><body style="margin:0"><iframe src="${file.data}" style="width:100%;height:100vh;border:none"></iframe></body>`);
    } else {
        // 기타: 다운로드
        const a = document.createElement('a');
        a.href = file.data; a.download = file.name;
        a.click();
    }
}

// ⭐ 파일 삭제
function deleteHealthFile(idx, fileType){
    if(idx < 0){ showToast('⚠ 예시 파일은 삭제할 수 없습니다'); return; }
    if(!confirm('파일을 삭제하시겠습니까?')) return;
    healths[idx][fileType] = null;
    // ⭐ 동의서/고령확인서 파일 삭제 시 '○' 표시도 해제
    if(fileType === 'file_consent') healths[idx].consent = '';
    if(fileType === 'file_elder') healths[idx].elder = '';
    saveHealthLS(); renderHealth();
    showToast('🗑 파일이 삭제되었습니다');
}

// ⭐ 파일 상태 뱃지 HTML 생성
function fileButtonHtml(idx, fileType, label, icon, requiredAge){
    const isEx = idx < 0;
    const record = isEx ? HEALTH_EXAMPLE : healths[idx];
    const file = record[fileType];
    const inputId = `file-${fileType}-${idx}`;

    // ⭐ 70세 이상 확인서는 70세 이상일 때만 필수 표시
    const ageAtExam = calcAge(record.birth, record.date);
    const isRequired70 = fileType === 'file_elder' && ageAtExam >= 70;
    const isSkip = fileType === 'file_elder' && ageAtExam < 70;

    if(isSkip){
        // 70세 미만은 고령확인서 불필요
        return `<div style="font-size:9px;color:#9ca3af;padding:2px 4px" title="70세 미만은 불필요">－</div>`;
    }

    if(file){
        // ⭐ 파일 있음: 초록 배지 + 보기/삭제 버튼
        return `
            <div style="display:flex;flex-direction:column;gap:2px;align-items:stretch">
                <div style="background:#d1fae5;color:#065f46;font-size:9px;font-weight:bold;padding:2px 4px;border-radius:3px;text-align:center" title="${file.name}\n업로드: ${file.uploadDate}">${icon} ${label}</div>
                <div style="display:flex;gap:2px">
                    <button onclick="viewHealthFile(${idx},'${fileType}')" style="flex:1;background:#3b82f6;color:white;font-size:9px;padding:1px 3px;border:none;border-radius:2px;cursor:pointer" title="보기">👁</button>
                    ${isEx ? '' : `<button onclick="deleteHealthFile(${idx},'${fileType}')" style="flex:1;background:#ef4444;color:white;font-size:9px;padding:1px 3px;border:none;border-radius:2px;cursor:pointer" title="삭제">🗑</button>`}
                </div>
            </div>`;
    } else {
        // ⭐ 파일 없음: 업로드 버튼
        const bg = isRequired70 ? '#fecaca' : '#fef3c7';
        const color = isRequired70 ? '#991b1b' : '#92400e';
        const label2 = isRequired70 ? `${label}필수` : label;
        return `
            <div>
                <label for="${inputId}" style="display:block;background:${bg};color:${color};font-size:9px;font-weight:bold;padding:3px 4px;border-radius:3px;text-align:center;cursor:${isEx?'not-allowed':'pointer'};border:1px dashed ${color}" title="${isEx?'예시는 업로드 불가':'클릭하여 '+label+' 업로드'}">${icon} ${label2}</div>
                ${isEx ? '' : `<input type="file" id="${inputId}" onchange="uploadHealthFile(${idx},'${fileType}',this)" accept="image/*,.pdf" style="display:none">`}
            </div>`;
    }
}

function renderHealth(){
    const dept=document.getElementById('f5-dept').value.toLowerCase();
    const name=document.getElementById('f5-name').value.toLowerCase();
    const rf=document.getElementById('f5-result').value;
    const tbody=document.getElementById('healthBody');
    tbody.innerHTML=''; const today=new Date();
    let ok=0, bad=0, soon=0, expired=0;

    const allRows = [HEALTH_EXAMPLE, ...healths];

    const filtered = allRows.filter(h=>{
        if(h._isExample) return true;
        if(dept && !(h.dept||'').toLowerCase().includes(dept)) return false;
        if(name && !(h.name||'').toLowerCase().includes(name)) return false;
        const result = judgeHealth(h).length?'부적격':'적격';
        if(rf && result!==rf) return false;
        return true;
    });

    healths.forEach(h=>{
        const reasons = judgeHealth(h);
        if(reasons.length) bad++; else ok++;
        const v = calcValid(h.date, h.birth);
        if(v){ const d=Math.ceil((new Date(v)-today)/86400000); if(d<0) expired++; else if(d<30) soon++; }
    });

    filtered.forEach((h,i)=>{
        const isEx = h._isExample;
        const idx = isEx ? -1 : healths.indexOf(h);
        const valid = calcValid(h.date, h.birth);
        const reasons = judgeHealth(h);
        const result = reasons.length?'부적격':'적격';
        const autoNote = reasons.length && !h.note ? `⚠ 복약·생활습관 개선 안내, 3개월 內 재제출 (${reasons.join(', ')})` : (h.note||'');

        const ageAtExam = calcAge(h.birth, h.date);
        const ageToday = calcAge(h.birth);

        let validBadge = '';
        if(ageAtExam >= 70){
            validBadge = '<div style="font-size:9px;color:#b91c1c;font-weight:bold;margin-top:2px">🔴 70세↑ 6개월</div>';
        } else if(ageAtExam >= 50){
            validBadge = '<div style="font-size:9px;color:#0369a1;font-weight:bold;margin-top:2px">🔵 50세↑ 1년</div>';
        } else if(h.birth){
            validBadge = '<div style="font-size:9px;color:#6b7280;font-weight:normal;margin-top:2px">50세 미만 1년</div>';
        }

        const rowStyle = isEx ? 'style="background:#fef9c3"' : '';
        const editable = isEx ? '' : 'contenteditable="true"';
        const label = isEx ? '<span title="예시 (편집 불가)" style="color:#a16207;font-weight:bold;">🔒 예시</span>' : (i);
        const delBtn = isEx
            ? '<span style="color:#ccc;cursor:not-allowed" title="예시는 삭제 불가">🔒</span>'
            : `<span class="row-del" onclick="delHealth(${idx})">✖</span>`;

        const ageCell = h.birth
            ? `<td style="background:#f9fafb;color:#1f2937;font-weight:bold" title="검진일 시점 만 나이 (오늘 기준: 만 ${ageToday}세)">만 ${ageAtExam}세</td>`
            : `<td style="color:#9ca3af;font-style:italic">생년월일 입력</td>`;

        // ⭐⭐⭐ 성명 + 3종 서류 업로드 셀
        const nameWithFilesCell = `
            <td ${editable} data-f="name" style="min-width:180px;padding:6px">
                <div style="font-weight:bold;font-size:12px;margin-bottom:4px">${h.name||'<span style=\"color:#9ca3af\">성명 입력</span>'}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:4px" onclick="event.stopPropagation()">
                    ${fileButtonHtml(idx, 'file_report', '검진결과', '📋')}
                    ${fileButtonHtml(idx, 'file_consent', '동의서', '📝')}
                    ${fileButtonHtml(idx, 'file_elder', '고령확인', '👴')}
                </div>
            </td>`;

        tbody.innerHTML += `
            <tr data-idx="${idx}" ${rowStyle}>
                <td>${label}</td>
                <td ${editable} data-f="dept">${h.dept||''}</td>
                ${nameWithFilesCell}
                <td ${editable} data-f="birth" title="생년월일 (YYYY-MM-DD)">${h.birth||''}</td>
                ${ageCell}
                <td ${editable} data-f="gender">${h.gender||''}</td>
                <td ${editable} data-f="date">${h.date||''}</td>
                <td class="col-valid">${valid}${validBadge}</td>
                <td class="col-criteria" style="font-size:9px;line-height:1.3">
                    SBP&lt;160/DBP&lt;100<br>
                    혈당70~180<br>
                    LDL&lt;190/TG&lt;500
                </td>
                <td ${editable} data-f="sbp" class="${isBad(h.sbp,160,90)?'val-bad':''}">${h.sbp||''}</td>
                <td ${editable} data-f="dbp" class="${isBad(h.dbp,100,50)?'val-bad':''}">${h.dbp||''}</td>
                <td ${editable} data-f="glucose" class="${isBad(h.glucose,180,70)?'val-bad':''}">${h.glucose||''}</td>
                <td ${editable} data-f="tg" class="${isBad(h.tg,500)?'val-bad':''}">${h.tg||''}</td>
                <td ${editable} data-f="ldl" class="${isBad(h.ldl,190)?'val-bad':''}">${h.ldl||''}</td>
                <td ${editable} data-f="note" style="text-align:left;white-space:normal;min-width:200px">${autoNote}</td>
                <td class="${result==='적격'?'result-ok':'result-bad'}">${result}</td>
                <td>${delBtn}</td>
            </tr>`;
    });

    document.getElementById('k5-total').innerHTML = healths.length+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-ok').innerHTML = ok+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-bad').innerHTML = bad+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-soon').innerHTML = soon+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k5-expired').innerHTML = expired+'<span class="text-xs text-gray-500"> 명</span>';

    const hdrHealth = document.getElementById('hdr-health');
    if(hdrHealth) hdrHealth.textContent = healths.length;

    document.querySelectorAll('#healthBody td[contenteditable="true"]').forEach(td=>{
        td.onblur = ()=>{
            const idx = parseInt(td.parentElement.dataset.idx);
            if(idx < 0) return;
            const f = td.dataset.f;
            let v = td.textContent.trim();
            if(['sbp','dbp','glucose','tg','ldl'].includes(f)) v = parseFloat(v)||0;
            // ⭐ 성명 셀은 첫 줄만 저장 (파일 UI가 함께 있으므로)
            if(f === 'name'){
                v = td.querySelector('div') ? td.querySelector('div').textContent.trim() : v;
            }
            if(f === 'birth' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)){
                alert('생년월일은 YYYY-MM-DD 형식으로 입력하세요 (예: 1980-05-15)');
                renderHealth();
                return;
            }
            healths[idx][f] = v;
            saveHealthLS(); renderHealth();
        };
        td.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); td.blur(); } };
    });
}

function addHealthRow(){
    healths.push({
        dept:'', name:'', birth:'', gender:'', date:'',
        sbp:0, dbp:0, glucose:0, tg:0, ldl:0,
        elder:'', consent:'', note:'',
        file_report:null, file_consent:null, file_elder:null  // ⭐
    });
    saveHealthLS(); renderHealth();
    showToast('빈 행이 추가되었습니다. 생년월일부터 입력하세요 (YYYY-MM-DD)');
}
function delHealth(idx){
    if(idx < 0){ showToast('⚠ 예시 행은 삭제할 수 없습니다'); return; }
    if(!confirm('삭제하시겠습니까? (첨부된 파일도 함께 삭제됩니다)')) return;
    healths.splice(idx,1); saveHealthLS(); renderHealth();
}

// ⭐ 검진결과서 업로드 개선: 파일이 자동으로 file_report에 저장되도록
function parseReport(e){
    const file=e.target.files[0]; if(!file) return;

    if(file.size > 5 * 1024 * 1024){
        alert('파일 크기는 5MB 이하만 가능합니다.');
        e.target.value = '';
        return;
    }

    showToast('📄 '+file.name+' 업로드 중...');
    const reader = new FileReader();
    reader.onload = (ev) => {
        // ⭐ 빈 행 추가 + 검진결과서 파일 자동 첨부
        healths.push({
            dept:'', name:'', birth:'', gender:'',
            date:new Date().toISOString().slice(0,10),
            sbp:0, dbp:0, glucose:0, tg:0, ldl:0,
            elder:'', consent:'', note:'📄 '+file.name+' 업로드됨 (수동 판독 필요)',
            file_report: {
                name: file.name, type: file.type, size: file.size,
                data: ev.target.result, uploadDate: new Date().toISOString().slice(0,10)
            },
            file_consent: null, file_elder: null
        });
        saveHealthLS(); renderHealth();
        showToast('✅ 검진결과서 첨부됨. 수치를 수동 입력해주세요');
        e.target.value='';
    };
    reader.readAsDataURL(file);
}

function downloadExcel(){
    const rows = healths.map((h,i)=>{
        const r = judgeHealth(h);
        const ageAtExam = calcAge(h.birth, h.date);
        return {
            '구분':i+1, '부서명':h.dept, '성명':h.name,
            '생년월일':h.birth||'',
            '만나이(검진일)': h.birth ? `만 ${ageAtExam}세` : '',
            '성별':h.gender, '검진일':h.date, '유효기간':calcValid(h.date, h.birth),
            'SBP':h.sbp, 'DBP':h.dbp, '공복혈당':h.glucose, 'T.G':h.tg, 'LDL':h.ldl,
            '검진결과서': h.file_report ? '✅ '+h.file_report.name : '❌ 미제출',
            '동의서': h.file_consent ? '✅ '+h.file_consent.name : '❌ 미제출',
            '고령확인서': ageAtExam >= 70 ? (h.file_elder ? '✅ '+h.file_elder.name : '❌ 미제출') : '해당없음',
            '기타':h.note||'',
            '검토결과':r.length?'부적격':'적격',
            '부적격사유':r.join(', ')
        };
    });
    if(rows.length === 0){ showToast('⚠ 다운로드할 데이터가 없습니다'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '안심건강근로제');
    XLSX.writeFile(wb, '안심건강근로제_'+new Date().toISOString().slice(0,10)+'.xlsx');
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
                dept:r['부서명']||'', name:r['성명']||'',
                birth:r['생년월일']||'',
                gender:r['성별']||'', date:r['검진일']||'',
                sbp:Number(r['SBP'])||0, dbp:Number(r['DBP'])||0,
                glucose:Number(r['공복혈당'])||0, tg:Number(r['T.G'])||0, ldl:Number(r['LDL'])||0,
                elder:'', consent:'', note:r['기타']||'',
                file_report:null, file_consent:null, file_elder:null  // ⭐ 엑셀은 파일 미포함
            });
        });
        saveHealthLS(); renderHealth();
        showToast(rows.length+'건 가져오기 완료 (파일은 별도 업로드 필요)');
        e.target.value='';
    };
    reader.readAsBinaryString(file);
}
