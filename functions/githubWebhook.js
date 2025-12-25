import Bot from './bot.js';

/**
 * 处理GitHub webhook并发送通知到Telegram
 * @param {Object} context - Cloudflare/Vercel函数上下文
 * @returns {Response} HTTP响应
 */
export async function onRequest(context) {
    const { request, env } = context;
    const bot = new Bot(env);

    // 只接受POST请求
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ code: 405, message: 'Please use POST method' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 405
        });
    }

    try {
        // 获取事件类型
        const eventType = request.headers.get('X-GitHub-Event');
        if (!eventType) {
            return new Response(JSON.stringify({ code: 400, message: 'Missing X-GitHub-Event header' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        // 验证签名（可选但推荐）
        const signature = request.headers.get('X-Hub-Signature-256');
        if (env.github_webhook_secret && signature) {
            const body = await request.text();
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', env.github_webhook_secret);
            const digest = 'sha256=' + hmac.update(body).digest('hex');
            
            if (signature !== digest) {
                return new Response(JSON.stringify({ code: 401, message: 'Invalid signature' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 401
                });
            }
            
            // 重新解析JSON，因为之前已经读取了body
            var data = JSON.parse(body);
        } else {
            var data = await request.json();
        }

        // 获取目标chat_id，可以从环境变量或请求参数中获取
        let chatId = null;
        
        // 1. 尝试从环境变量获取默认chat_id
        if (env.default_chat_id) {
            chatId = env.default_chat_id;
        }
        
        // 2. 尝试从请求参数获取token并解密获取chat_id
        if (!chatId) {
            const url = new URL(request.url);
            const token = url.searchParams.get('token');
            if (token) {
                try {
                    chatId = bot.decryption(token);
                } catch (e) {
                    console.error('Failed to decrypt token:', e);
                }
            }
        }

        if (!chatId) {
            return new Response(JSON.stringify({ code: 422, message: 'No valid chat_id provided' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 422
            });
        }

        // 根据事件类型格式化消息
        let message = '';
        
        switch (eventType) {
            case 'pull_request':
                message = formatPullRequestMessage(data);
                break;
            case 'push':
                message = formatPushMessage(data);
                break;
            case 'issues':
                message = formatIssuesMessage(data);
                break;
            case 'release':
                message = formatReleaseMessage(data);
                break;
            default:
                message = `收到GitHub事件: ${eventType}`;
        }

        if (message) {
            // 发送消息到Telegram
            const ret = await bot.sendMessage({ 
                text: message, 
                chat_id: chatId,
                parse_mode: 'HTML'
            });

            if (ret.ok) {
                return new Response(JSON.stringify({ code: 200, message: 'Notification sent successfully' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                return new Response(JSON.stringify({ code: 422, message: ret.description }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 422
                });
            }
        } else {
            return new Response(JSON.stringify({ code: 200, message: 'No message to send' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (e) {
        console.error('Error processing GitHub webhook:', e);
        return new Response(JSON.stringify({ code: 500, message: 'Server error' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

/**
 * 格式化Pull Request消息
 * @param {Object} data - GitHub webhook数据
 * @returns {string} 格式化后的消息
 */
function formatPullRequestMessage(data) {
    const { action, pull_request, repository, sender } = data;
    
    if (!pull_request || !repository) return '';
    
    const title = pull_request.title;
    const number = pull_request.number;
    const htmlUrl = pull_request.html_url;
    const repoName = repository.full_name;
    const senderLogin = sender.login;
    
    let actionText = '';
    switch (action) {
        case 'opened':
            actionText = '创建了新的';
            break;
        case 'closed':
            actionText = pull_request.merged ? '合并了' : '关闭了';
            break;
        case 'reopened':
            actionText = '重新打开了';
            break;
        case 'edited':
            actionText = '编辑了';
            break;
        default:
            actionText = `更新了(${action})`;
    }
    
    return `<b>GitHub PR通知</b>\n\n` +
           `<a href="${htmlUrl}">${repoName} #${number}</a>\n` +
           `${senderLogin} ${actionText} Pull Request: ${title}`;
}

/**
 * 格式化Push消息
 * @param {Object} data - GitHub webhook数据
 * @returns {string} 格式化后的消息
 */
function formatPushMessage(data) {
    const { ref, repository, pushes, sender, head_commit } = data;
    
    if (!repository || !head_commit) return '';
    
    const repoName = repository.full_name;
    const branch = ref.replace('refs/heads/', '');
    const senderLogin = sender.login;
    const commitMessage = head_commit.message;
    const commitUrl = head_commit.url;
    
    // 只显示第一条提交信息，避免消息过长
    return `<b>GitHub Push通知</b>\n\n` +
           `<a href="${repository.html_url}">${repoName}</a>\n` +
           `${senderLogin} 推送到 ${branch} 分支\n` +
           `提交: ${commitMessage.substring(0, 100)}${commitMessage.length > 100 ? '...' : ''}`;
}

/**
 * 格式化Issues消息
 * @param {Object} data - GitHub webhook数据
 * @returns {string} 格式化后的消息
 */
function formatIssuesMessage(data) {
    const { action, issue, repository, sender } = data;
    
    if (!issue || !repository) return '';
    
    const title = issue.title;
    const number = issue.number;
    const htmlUrl = issue.html_url;
    const repoName = repository.full_name;
    const senderLogin = sender.login;
    
    let actionText = '';
    switch (action) {
        case 'opened':
            actionText = '创建了新的';
            break;
        case 'closed':
            actionText = '关闭了';
            break;
        case 'reopened':
            actionText = '重新打开了';
            break;
        case 'edited':
            actionText = '编辑了';
            break;
        default:
            actionText = `更新了(${action})`;
    }
    
    return `<b>GitHub Issue通知</b>\n\n` +
           `<a href="${htmlUrl}">${repoName} #${number}</a>\n` +
           `${senderLogin} ${actionText} Issue: ${title}`;
}

/**
 * 格式化Release消息
 * @param {Object} data - GitHub webhook数据
 * @returns {string} 格式化后的消息
 */
function formatReleaseMessage(data) {
    const { action, release, repository, sender } = data;
    
    if (!release || !repository) return '';
    
    const tagName = release.tag_name;
    const name = release.name || tagName;
    const htmlUrl = release.html_url;
    const repoName = repository.full_name;
    const senderLogin = sender.login;
    
    let actionText = '';
    switch (action) {
        case 'published':
            actionText = '发布了新的';
            break;
        default:
            actionText = `更新了(${action})`;
    }
    
    return `<b>GitHub Release通知</b>\n\n` +
           `<a href="${htmlUrl}">${repoName}</a>\n` +
           `${senderLogin} ${actionText} Release: ${name}`;
}