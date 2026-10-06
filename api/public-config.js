// 공개 설정 제공: 화면이 로그인(Auth)에 쓸 Supabase URL·publishable 키를 서버에서 돌려줍니다.
// 둘 다 공개용 값이라 브라우저로 가도 되지만, 화면 '코드'에 하드코딩하지 않고 여기(서버 함수)에만 둡니다.
// 서버 전용 비밀 키(SUPABASE_SECRET_KEY)는 절대 반환하지 않습니다.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    console.error('public-config: SUPABASE_URL 또는 SUPABASE_PUBLISHABLE_KEY 환경변수가 없습니다.');
    response.status(500).json({ error: 'PUBLIC_CONFIG_NOT_CONFIGURED' });
    return;
  }
  response.status(200).json({ url, publishableKey });
}
