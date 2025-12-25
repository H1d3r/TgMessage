import Bot from './bot.js';

export async function onRequest(context) {
    const { request, env } = context;
    const bot = new Bot(env);

    if (request.method !== 'POST') {
        return new Response('Please use POST method', { status: 405 });
    }

    try {
        const data = await request.json();
        const message = data.message?.text ?? '';
        const chat_id = data.message?.chat?.id;

        // 检查必要的数据是否存在
        if (!chat_id) {
            console.error('No chat_id found in webhook data:', JSON.stringify(data));
            return new Response(JSON.stringify({ code: 400, message: 'No chat_id found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        // 检查环境变量是否设置
        if (!env.token) {
            console.error('Bot token not found in environment variables');
            return new Response(JSON.stringify({ code: 500, message: 'Bot token not configured' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 500
            });
        }

        if (message === '/token') {
            try {
                const encryptedToken = bot.encryption(chat_id);
                console.log(`Generated token for chat_id ${chat_id}: ${encryptedToken}`);
                
                const ret = await bot.sendMessage({ 
                    text: `您的专属 Token:\n\n${encryptedToken}\n\n请保存此 Token，用于发送消息通知。`, 
                    chat_id: chat_id 
                });
                
                if (!ret.ok) {
                    console.error('Failed to send token message:', ret);
                    return new Response(JSON.stringify({ code: 500, message: `Failed to send message: ${ret.description}` }), {
                        headers: { 'Content-Type': 'application/json' },
                        status: 500
                    });
                }
                
                console.log('Token sent successfully');
            } catch (e) {
                console.error('Error generating or sending token:', e);
                return new Response(JSON.stringify({ code: 500, message: `Error: ${e.message}` }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 500
                });
            }
        }
    } catch (e) {
        console.error('Error processing webhook:', e);
        return new Response(JSON.stringify({ code: 500, message: `Server error: ${e.message}` }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
    
    // Always return a success response to Telegram
    return new Response(JSON.stringify({ code: 200, message: 'success' }), {
        headers: { 'Content-Type': 'application/json' }
    });
}