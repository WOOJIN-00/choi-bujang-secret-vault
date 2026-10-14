// 11단계 기기 승인 확인(라우트 아님: _ 시작).
// 승인 여부는 '서버의 device_approvals 표'에서만 읽습니다.
//   - 브라우저가 보낸 값(버튼 클릭·플래그·저장소)으로 승인하지 않습니다.
//   - 승인 '요청'(POST)은 요청만 기록하고, approved=true 로 만들지 않습니다(서버/관리자가 따로 승인).
//   - 기기 키는 어디에도 저장하지 않습니다. 승인은 검증된 사용자 신원(userId)으로 식별합니다.

// 현재 사용자/기기의 승인 상태를 서버에서 읽습니다.
export async function readDeviceStatus(supabase, userId) {
  if (typeof userId !== 'string' || !userId) return { ok: true, approved: false, requested: false };
  const { data, error } = await supabase
    .from('device_approvals')
    .select('approved, requested_at, approved_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, approved: false, requested: false, reason: 'device_backend' };
  if (!data) return { ok: true, approved: false, requested: false };
  return {
    ok: true,
    approved: data.approved === true,
    requested: true,
    approvedAt: data.approved_at ?? null,
  };
}

// 보호 자료 접근에 쓰는 승인 판단. 서버 표에서 approved=true 일 때만 true.
export async function deviceApproved(supabase, userId) {
  const status = await readDeviceStatus(supabase, userId);
  return status.ok === true && status.approved === true;
}

// 승인 '요청'을 기록합니다. 이미 행이 있으면 그대로 두어(approved 유지) 요청으로 권한을 올리지 않습니다.
export async function requestDeviceApproval(supabase, userId) {
  const { error } = await supabase
    .from('device_approvals')
    .upsert({ user_id: userId, requested_at: new Date().toISOString() },
      { onConflict: 'user_id', ignoreDuplicates: true });
  return !error;
}
