/**
 * Screen Share Together - 主应用逻辑
 * 使用二维码辅助连接码分享
 */

class App {
    constructor() {
        this.screens = {
            welcome: document.getElementById('welcome-screen'),
            host: document.getElementById('host-screen'),
            viewer: document.getElementById('viewer-screen'),
            call: document.getElementById('call-screen')
        };

        this.rtc = window.webrtcManager;
        this.bindEvents();
        this.setupRTCCallbacks();
    }

    bindEvents() {
        // 角色选择
        document.getElementById('btn-host').addEventListener('click', () => this.showScreen('host'));
        document.getElementById('btn-viewer').addEventListener('click', () => this.showScreen('viewer'));

        // 返回按钮
        document.getElementById('host-back').addEventListener('click', () => this.goBack());
        document.getElementById('viewer-back').addEventListener('click', () => this.goBack());

        // 共享端
        document.getElementById('btn-start-share').addEventListener('click', () => this.startSharing());
        document.getElementById('btn-copy-offer').addEventListener('click', () => this.copyToClipboard('host-offer-code'));
        document.getElementById('btn-connect-host').addEventListener('click', () => this.connectAsHost());

        // 观看端
        document.getElementById('btn-process-offer').addEventListener('click', () => this.processOffer());
        document.getElementById('btn-copy-answer').addEventListener('click', () => this.copyToClipboard('viewer-answer-code'));

        // 通话控制
        document.getElementById('btn-toggle-mute').addEventListener('click', () => this.toggleMute());
        document.getElementById('btn-toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());
    }

    setupRTCCallbacks() {
        this.rtc.onRemoteScreen = (stream) => {
            const video = document.getElementById('remote-screen');
            video.srcObject = stream;
            document.getElementById('remote-screen-placeholder').classList.add('hidden');
        };

        this.rtc.onRemoteCamera = (stream) => {
            document.getElementById('remote-camera').srcObject = stream;
        };

        this.rtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
            if (state === 'connected') {
                this.showScreen('call');
                this.showToast('连接成功！');
            }
        };
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => screen.classList.remove('active'));
        this.screens[screenName].classList.add('active');
    }

    goBack() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
    }

    resetUI() {
        // 重置共享端
        document.querySelectorAll('#host-screen .step').forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i === 0) step.classList.add('active');
        });
        document.getElementById('host-offer-code').value = '';
        document.getElementById('host-answer-code').value = '';
        document.getElementById('host-preview').classList.add('hidden');

        // 清除二维码
        const hostQr = document.getElementById('host-qr-code');
        const ctx1 = hostQr.getContext('2d');
        ctx1.clearRect(0, 0, hostQr.width, hostQr.height);

        // 重置观看端
        document.querySelectorAll('#viewer-screen .step').forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i === 0) step.classList.add('active');
        });
        document.getElementById('viewer-offer-code').value = '';
        document.getElementById('viewer-answer-code').value = '';

        const viewerQr = document.getElementById('viewer-qr-code');
        const ctx2 = viewerQr.getContext('2d');
        ctx2.clearRect(0, 0, viewerQr.width, viewerQr.height);

        // 重置通话界面
        document.getElementById('remote-screen').srcObject = null;
        document.getElementById('remote-camera').srcObject = null;
        document.getElementById('local-camera').srcObject = null;
        document.getElementById('remote-screen-placeholder').classList.remove('hidden');
    }

    /**
     * 生成二维码
     */
    generateQRCode(canvasId, text) {
        const canvas = document.getElementById(canvasId);

        // 检查 QRCode 库是否加载
        if (typeof QRCode === 'undefined') {
            console.log('QRCode库未加载，跳过二维码生成');
            return;
        }

        try {
            QRCode.toCanvas(canvas, text, {
                width: 200,
                margin: 2,
                color: {
                    dark: '#6366f1',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) console.log('二维码生成失败:', error);
            });
        } catch (e) {
            console.log('二维码生成异常:', e);
        }
    }

    /**
     * 开始共享屏幕
     */
    async startSharing() {
        try {
            // 检测设备支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isMobile) {
                    alert('手机不支持屏幕共享\n\n请在电脑上共享屏幕，手机作为观看端');
                } else {
                    alert('浏览器不支持屏幕共享，请使用Chrome');
                }
                return;
            }

            this.showToast('正在获取屏幕...');

            // 获取屏幕共享
            const screenStream = await this.rtc.getScreenShare();
            document.getElementById('local-screen-preview').srcObject = screenStream;
            document.getElementById('host-preview').classList.remove('hidden');

            // 尝试获取摄像头（可选，失败不影响）
            try {
                await this.rtc.getUserMedia();
            } catch (e) {
                console.log('摄像头获取失败（可选）:', e);
            }

            this.showToast('正在生成连接码...');
            const offerCode = await this.rtc.createOffer();

            // 显示连接码
            document.getElementById('host-offer-code').value = offerCode;

            // 生成二维码
            this.generateQRCode('host-qr-code', offerCode);

            // 更新步骤
            document.getElementById('host-step-1').classList.remove('active');
            document.getElementById('host-step-1').classList.add('completed');
            document.getElementById('host-step-2').classList.add('active');
            document.getElementById('host-step-3').classList.add('active');

            this.showToast('连接码已生成！');

        } catch (error) {
            console.error('共享失败:', error);
            if (error.name === 'NotAllowedError') {
                this.showToast('您取消了屏幕共享');
            } else {
                this.showToast('共享失败: ' + error.message);
            }
        }
    }

    /**
     * 共享端：处理回复码
     */
    async connectAsHost() {
        const answerCode = document.getElementById('host-answer-code').value.trim();

        if (!answerCode) {
            this.showToast('请粘贴回复码');
            return;
        }

        try {
            this.showToast('正在连接...');
            await this.rtc.handleAnswer(answerCode);

            if (this.rtc.localStream) {
                document.getElementById('local-camera').srcObject = this.rtc.localStream;
            }

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
            this.showToast('请粘贴连接码');
            return;
        }

        try {
            // 尝试获取摄像头（可选）
            try {
                await this.rtc.getUserMedia();
            } catch (e) {
                console.log('摄像头获取失败（可选）:', e);
            }

            this.showToast('正在生成回复码...');
            const answerCode = await this.rtc.handleOfferAndCreateAnswer(offerCode);

            // 显示回复码
            document.getElementById('viewer-answer-code').value = answerCode;

            // 生成二维码
            this.generateQRCode('viewer-qr-code', answerCode);

            // 更新步骤
            document.getElementById('viewer-step-1').classList.remove('active');
            document.getElementById('viewer-step-1').classList.add('completed');
            document.getElementById('viewer-step-2').classList.add('active');

            if (this.rtc.localStream) {
                document.getElementById('local-camera').srcObject = this.rtc.localStream;
            }

            this.showToast('回复码已生成，发给朋友！');

        } catch (error) {
            console.error('处理失败:', error);
            this.showToast('处理失败: ' + error.message);
        }
    }

    /**
     * 复制到剪贴板
     */
    async copyToClipboard(elementId) {
        const textarea = document.getElementById(elementId);
        const text = textarea.value;

        if (!text) {
            this.showToast('没有内容可复制');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showToast('已复制！');
        } catch (error) {
            textarea.select();
            document.execCommand('copy');
            this.showToast('已复制！');
        }
    }

    toggleMute() {
        const isMuted = this.rtc.toggleMute();
        const btn = document.getElementById('btn-toggle-mute');
        btn.classList.toggle('active', isMuted);
        btn.querySelector('.icon-unmuted').classList.toggle('hidden', isMuted);
        btn.querySelector('.icon-muted').classList.toggle('hidden', !isMuted);
        this.showToast(isMuted ? '已静音' : '已取消静音');
    }

    toggleCamera() {
        const isCameraOff = this.rtc.toggleCamera();
        const btn = document.getElementById('btn-toggle-camera');
        btn.classList.toggle('active', isCameraOff);
        btn.querySelector('.icon-camera-on').classList.toggle('hidden', isCameraOff);
        btn.querySelector('.icon-camera-off').classList.toggle('hidden', !isCameraOff);
        this.showToast(isCameraOff ? '摄像头已关' : '摄像头已开');
    }

    endCall() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
        this.showToast('已结束');
    }

    updateConnectionStatus(state) {
        const dot = document.getElementById('connection-status-dot');
        const text = document.getElementById('connection-status-text');

        dot.classList.remove('connected', 'disconnected');

        const statusMap = {
            'connected': ['connected', '已连接'],
            'connecting': ['', '连接中...'],
            'disconnected': ['disconnected', '已断开'],
            'failed': ['disconnected', '连接失败'],
            'closed': ['disconnected', '已关闭']
        };

        const [cls, txt] = statusMap[state] || ['', state];
        if (cls) dot.classList.add(cls);
        text.textContent = txt;
    }

    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        toast.offsetHeight;
        toast.classList.add('show');

        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
