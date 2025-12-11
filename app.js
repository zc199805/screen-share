/**
 * Screen Share Together - 主应用逻辑
 */

class App {
    constructor() {
        // 屏幕元素
        this.screens = {
            welcome: document.getElementById('welcome-screen'),
            host: document.getElementById('host-screen'),
            viewer: document.getElementById('viewer-screen'),
            call: document.getElementById('call-screen')
        };

        // WebRTC 管理器
        this.rtc = window.webrtcManager;

        // 绑定事件
        this.bindEvents();

        // 初始化 WebRTC 回调
        this.setupRTCCallbacks();
    }

    /**
     * 绑定 UI 事件
     */
    bindEvents() {
        // 角色选择
        document.getElementById('btn-host').addEventListener('click', () => this.showScreen('host'));
        document.getElementById('btn-viewer').addEventListener('click', () => this.showScreen('viewer'));

        // 返回按钮
        document.getElementById('host-back').addEventListener('click', () => this.goBack());
        document.getElementById('viewer-back').addEventListener('click', () => this.goBack());

        // 共享端按钮
        document.getElementById('btn-start-share').addEventListener('click', () => this.startSharing());
        document.getElementById('btn-copy-offer').addEventListener('click', () => this.copyToClipboard('host-offer-code'));
        document.getElementById('btn-connect-host').addEventListener('click', () => this.connectAsHost());

        // 观看端按钮
        document.getElementById('btn-process-offer').addEventListener('click', () => this.processOffer());
        document.getElementById('btn-copy-answer').addEventListener('click', () => this.copyToClipboard('viewer-answer-code'));

        // 通话控制按钮
        document.getElementById('btn-toggle-mute').addEventListener('click', () => this.toggleMute());
        document.getElementById('btn-toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());
    }

    /**
     * 设置 WebRTC 回调
     */
    setupRTCCallbacks() {
        // 远程屏幕共享流
        this.rtc.onRemoteScreen = (stream) => {
            console.log('收到远程屏幕流');
            const video = document.getElementById('remote-screen');
            video.srcObject = stream;
            document.getElementById('remote-screen-placeholder').classList.add('hidden');
        };

        // 远程摄像头流
        this.rtc.onRemoteCamera = (stream) => {
            console.log('收到远程摄像头流');
            const video = document.getElementById('remote-camera');
            video.srcObject = stream;
        };

        // 连接状态变化
        this.rtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
        };
    }

    /**
     * 切换屏幕
     */
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
    }

    /**
     * 返回欢迎页
     */
    goBack() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
    }

    /**
     * 重置 UI 状态
     */
    resetUI() {
        // 重置共享端步骤
        document.querySelectorAll('#host-screen .step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index === 0) step.classList.add('active');
        });
        document.getElementById('host-offer-code').value = '';
        document.getElementById('host-answer-code').value = '';
        document.getElementById('host-preview').classList.add('hidden');

        // 重置观看端步骤
        document.querySelectorAll('#viewer-screen .step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index === 0) step.classList.add('active');
        });
        document.getElementById('viewer-offer-code').value = '';
        document.getElementById('viewer-answer-code').value = '';

        // 重置通话界面
        document.getElementById('remote-screen').srcObject = null;
        document.getElementById('remote-camera').srcObject = null;
        document.getElementById('local-camera').srcObject = null;
        document.getElementById('remote-screen-placeholder').classList.remove('hidden');

        // 重置按钮状态
        const muteBtn = document.getElementById('btn-toggle-mute');
        muteBtn.classList.remove('active');
        muteBtn.querySelector('.icon-unmuted').classList.remove('hidden');
        muteBtn.querySelector('.icon-muted').classList.add('hidden');

        const cameraBtn = document.getElementById('btn-toggle-camera');
        cameraBtn.classList.remove('active');
        cameraBtn.querySelector('.icon-camera-on').classList.remove('hidden');
        cameraBtn.querySelector('.icon-camera-off').classList.add('hidden');
    }

    /**
     * 共享端：开始共享屏幕
     */
    async startSharing() {
        try {
            // 获取屏幕共享
            const screenStream = await this.rtc.getScreenShare();

            // 获取摄像头/麦克风
            const cameraStream = await this.rtc.getUserMedia();

            // 显示本地预览
            document.getElementById('local-screen-preview').srcObject = screenStream;
            document.getElementById('local-camera-preview').srcObject = cameraStream;
            document.getElementById('host-preview').classList.remove('hidden');

            // 创建 Offer
            this.showToast('正在生成连接码...');
            const offerCode = await this.rtc.createOffer();

            // 显示连接码
            document.getElementById('host-offer-code').value = offerCode;

            // 更新步骤状态
            document.getElementById('host-step-1').classList.remove('active');
            document.getElementById('host-step-1').classList.add('completed');
            document.getElementById('host-step-2').classList.add('active');
            document.getElementById('host-step-3').classList.add('active');

            this.showToast('连接码已生成，请复制发送给朋友');

        } catch (error) {
            console.error('开始共享失败:', error);
            this.showToast('无法开始共享: ' + error.message);
        }
    }

    /**
     * 共享端：处理回复码并连接
     */
    async connectAsHost() {
        const answerCode = document.getElementById('host-answer-code').value.trim();

        if (!answerCode) {
            this.showToast('请粘贴朋友发来的回复码');
            return;
        }

        try {
            this.showToast('正在建立连接...');
            await this.rtc.handleAnswer(answerCode);

            // 设置本地摄像头到通话界面
            document.getElementById('local-camera').srcObject = this.rtc.localStream;

            // 切换到通话界面
            this.showScreen('call');
            this.showToast('连接成功！');

        } catch (error) {
            console.error('连接失败:', error);
            this.showToast('连接失败: ' + error.message);
        }
    }

    /**
     * 观看端：处理连接码
     */
    async processOffer() {
        const offerCode = document.getElementById('viewer-offer-code').value.trim();

        if (!offerCode) {
            this.showToast('请粘贴朋友发来的连接码');
            return;
        }

        try {
            // 获取摄像头/麦克风
            await this.rtc.getUserMedia();

            // 处理 Offer 并创建 Answer
            this.showToast('正在生成回复码...');
            const answerCode = await this.rtc.handleOfferAndCreateAnswer(offerCode);

            // 显示回复码
            document.getElementById('viewer-answer-code').value = answerCode;

            // 更新步骤状态
            document.getElementById('viewer-step-1').classList.remove('active');
            document.getElementById('viewer-step-1').classList.add('completed');
            document.getElementById('viewer-step-2').classList.add('active');

            this.showToast('回复码已生成，请复制发送给朋友');

            // 设置本地摄像头到通话界面
            document.getElementById('local-camera').srcObject = this.rtc.localStream;

            // 监听连接成功后自动切换到通话界面
            const checkConnection = setInterval(() => {
                const state = this.rtc.getConnectionState();
                if (state === 'connected') {
                    clearInterval(checkConnection);
                    this.showScreen('call');
                    this.showToast('连接成功！');
                } else if (state === 'failed' || state === 'disconnected') {
                    clearInterval(checkConnection);
                    this.showToast('连接失败，请重试');
                }
            }, 500);

            // 30秒超时
            setTimeout(() => clearInterval(checkConnection), 30000);

        } catch (error) {
            console.error('处理连接码失败:', error);
            this.showToast('无效的连接码: ' + error.message);
        }
    }

    /**
     * 复制到剪贴板
     */
    async copyToClipboard(elementId) {
        const textarea = document.getElementById(elementId);
        const text = textarea.value;

        if (!text) {
            this.showToast('没有可复制的内容');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showToast('已复制到剪贴板');
        } catch (error) {
            // 降级方案
            textarea.select();
            document.execCommand('copy');
            this.showToast('已复制到剪贴板');
        }
    }

    /**
     * 切换静音
     */
    toggleMute() {
        const isMuted = this.rtc.toggleMute();
        const btn = document.getElementById('btn-toggle-mute');

        btn.classList.toggle('active', isMuted);
        btn.querySelector('.icon-unmuted').classList.toggle('hidden', isMuted);
        btn.querySelector('.icon-muted').classList.toggle('hidden', !isMuted);

        this.showToast(isMuted ? '已静音' : '已取消静音');
    }

    /**
     * 切换摄像头
     */
    toggleCamera() {
        const isCameraOff = this.rtc.toggleCamera();
        const btn = document.getElementById('btn-toggle-camera');

        btn.classList.toggle('active', isCameraOff);
        btn.querySelector('.icon-camera-on').classList.toggle('hidden', isCameraOff);
        btn.querySelector('.icon-camera-off').classList.toggle('hidden', !isCameraOff);

        this.showToast(isCameraOff ? '已关闭摄像头' : '已开启摄像头');
    }

    /**
     * 结束通话
     */
    endCall() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
        this.showToast('通话已结束');
    }

    /**
     * 更新连接状态显示
     */
    updateConnectionStatus(state) {
        const dot = document.getElementById('connection-status-dot');
        const text = document.getElementById('connection-status-text');

        dot.classList.remove('connected', 'disconnected');

        switch (state) {
            case 'connected':
                dot.classList.add('connected');
                text.textContent = '已连接';
                break;
            case 'connecting':
                text.textContent = '连接中...';
                break;
            case 'disconnected':
                dot.classList.add('disconnected');
                text.textContent = '连接断开';
                break;
            case 'failed':
                dot.classList.add('disconnected');
                text.textContent = '连接失败';
                break;
            case 'closed':
                dot.classList.add('disconnected');
                text.textContent = '已关闭';
                break;
            default:
                text.textContent = state;
        }
    }

    /**
     * 显示 Toast 通知
     */
    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        toastMessage.textContent = message;
        toast.classList.remove('hidden');

        // 触发重排以启动动画
        toast.offsetHeight;
        toast.classList.add('show');

        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
