// functions/api/inspect/health.js
// Cloudflare Pages Functions - 공식 API 프록시 헬스체크
// 클라이언트 checkApiHealth() 가 호출: GET /api/inspect/health

export async function onRequest(context) {
    return new Response(JSON.stringify({
        ok: true,
        service: 'inspect',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        message: '공식 API 프록시 정상 동작 중'
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=60'
        }
    });
}
