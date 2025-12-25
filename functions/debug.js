import Bot from './bot.js';

export async function onRequest(context) {
    const { request, env } = context;
    const bot = new Bot(env);
    const url = new URL(request.url);

    // 只接受 GET 请求
    if (request.method !== 'GET') {
        return new Response('Please use GET method', { status: 405 });
    }

    // 检查环境变量
    const envStatus = {
        token: !!env.token,
        sign_key: !!env.sign_key,
        key: !!env.key
    };

    // 获取当前 webhook 信息
    let webhookInfo = null;
    try {
        webhookInfo = await bot.request('getWebhookInfo', {});
    } catch (e) {
        console.error('Error getting webhook info:', e);
    }

    // 构建响应
    const response = {
        environment: envStatus,
        hostname: url.hostname,
        webhookUrl: `https://${url.hostname}/api/webhook`,
        webhookInfo: webhookInfo,
        timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(response, null, 2), {
        headers: { 'Content-Type': 'application/json' }
    });
}