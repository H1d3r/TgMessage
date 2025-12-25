import Bot from './bot.js';

export async function onRequest(context) {
    const { request, env } = context;
    const bot = new Bot(env);
    const url = new URL(request.url);

    const key = url.searchParams.get('key');

    if (key !== env.key) {
        return new Response(JSON.stringify({ code: 401, message: 'unauthorized' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    // Default webhook URL is the current function's host + /api/webhook for Vercel
    // or /webhook for EdgeOne
    const isVercel = url.hostname.includes('vercel.app') || url.hostname.includes('vercel.com');
    const webhookPath = isVercel ? '/api/webhook' : '/webhook';
    const webhookUrl = url.searchParams.get('url') || `https://${url.hostname}${webhookPath}`;
    
    const ret = await bot.setWebHook({ url: webhookUrl });

    if (ret.ok) {
        return new Response(JSON.stringify({ code: 200, message: `Webhook set to ${webhookUrl}` }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } else {
        return new Response(JSON.stringify({ code: 422, message: ret.description }), {
            headers: { 'Content-Type': 'application/json' },
            status: 422
        });
    }
}