/**
 * Screen Share Together - 简化版应用逻辑
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

        // 返回
        document.getElementById('host-back').addEventListener('click', () => this.goBack());
        document.getElementById('viewer-back').addEventListener('click', () => this.goBack());

        // 共享端
        document.getElementById('btn-start-share').addEventListener('click', () => this.startSharing());
        document.getElementById('btn-copy-offer').addEventListener('click', () => this.copyCode('host-offer-code'));
        document.getElementById('btn-connect-host').addEventListener('click', () => this.connectAsHost());

        // 观看端
        document.getElementById('btn-process-offer').addEventListener('click', () => this.processOffer());
        document.getElementById('btn-copy-answer').addEventListener('click', () => this.copyCode('viewer-answer-code'));

        // 通话控制
        document.getElementById('btn-toggle-mute').addEventListener('click', () => this.toggleMute());
        document.getElementById('btn-toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());
    }

    setupRTCCallbacks() {
        this.rtc.onRemoteScreen = (stream) => {
            document.getElementById('remote-screen').srcObject = stream;
            document.getElementById('remote-screen-placeholder').classList.add('hidden');
        };

        this.rtc.onRemoteCamera = (stream) => {
            document.getElementById('remote-camera').srcObject = stream;
        };

        this.rtc.onConnectionStateChange = (state) => {
            this.updateStatus(state);
            if (state === 'connected') {
                this.showScreen('call');
                this.showToast('连接成功！');
            }
        };
    }

    showScreen(name) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        this.screens[name].classList.add('active');
    }

    goBack() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
    }

    resetUI() {
        // 重置步骤
        document.querySelectorAll('.step').forEach((s, i) => {
            s.classList.remove('active', 'completed');
            if (s.id.includes('step-1')) s.classList.add('active');
        });

        // 清空输入
        document.getElementById('host-offer-code').value = '';
        document.getElementById('host-answer-code').value = '';
        document.getElementById('viewer-offer-code').value = '';
        document.getElementById('viewer-answer-code').value = '';
        document.getElementById('host-preview').classList.add('hidden');

        // 重置视频
        document.getElementById('remote-screen').srcObject = null;
        document.getElementById('remote-camera').srcObject = null;
        document.getElementById('local-camera').srcObject = null;
        document.getElementById('remote-screen-placeholder').classList.remove('hidden');
    }

    async startSharing() {
        try {
            // 检测支持
            if (!navigator.mediaDevices?.getDisplayMedia) {
                const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
                alert(isMobile ? '手机不支持屏幕共享，请用电脑' : '浏览器不支持，请用Chrome');
                return;
            }

            this.showToast('正在获取屏幕...');

            // 获取屏幕
            const screen = await this.rtc.getScreenShare();
            document.getElementById('local-screen-preview').srcObject = screen;
            document.getElementById('host-preview').classList.remove('hidden');

            // 尝试获取摄像头（可选）
            try { await this.rtc.getUserMedia(); } catch (e) { }

            // 生成连接码
            this.showToast('正在生成连接码...');
            const code = await this.rtc.createOffer();
            document.getElementById('host-offer-code').value = code;

            // 更新步骤
            document.getElementById('host-step-1').classList.remove('active');
            document.getElementById('host-step-1').classList.add('completed');
            document.getElementById('host-step-2').classList.add('active');
            document.getElementById('host-step-3').classList.add('active');

            this.showToast('连接码已生成，复制发给朋友！');

        } catch (e) {
            this.showToast(e.name === 'NotAllowedError' ? '已取消' : '失败: ' + e.message);
        }
    }

    async connectAsHost() {
        const code = document.getElementById('host-answer-code').value.trim();
        if (!code) return this.showToast('请粘贴回复码');

        try {
            this.showToast('正在连接...');
            await this.rtc.handleAnswer(code);
            if (this.rtc.localStream) {
                document.getElementById('local-camera').srcObject = this.rtc.localStream;
            }
        } catch (e) {
            this.showToast('连接失败: ' + e.message);
        }
    }

    async processOffer() {
        const code = document.getElementById('viewer-offer-code').value.trim();
        if (!code) return this.showToast('请粘贴连接码');

        try {
            // 尝试摄像头（可选）
            try { await this.rtc.getUserMedia(); } catch (e) { }

            this.showToast('正在生成回复码...');
            const answer = await this.rtc.handleOfferAndCreateAnswer(code);
            document.getElementById('viewer-answer-code').value = answer;

            // 更新步骤
            document.getElementById('viewer-step-1').classList.remove('active');
            document.getElementById('viewer-step-1').classList.add('completed');
            document.getElementById('viewer-step-2').classList.add('active');

            if (this.rtc.localStream) {
                document.getElementById('local-camera').srcObject = this.rtc.localStream;
            }

            this.showToast('回复码已生成，复制发给朋友！');

        } catch (e) {
            this.showToast('失败: ' + e.message);
        }
    }

    async copyCode(id) {
        const text = document.getElementById(id).value;
        if (!text) return this.showToast('没有内容');

        try {
            await navigator.clipboard.writeText(text);
            this.showToast('已复制！可以发给朋友了');
        } catch (e) {
            document.getElementById(id).select();
            document.execCommand('copy');
            this.showToast('已复制！');
        }
    }

    toggleMute() {
        const muted = this.rtc.toggleMute();
        const btn = document.getElementById('btn-toggle-mute');
        btn.classList.toggle('active', muted);
        btn.querySelector('.icon-unmuted').classList.toggle('hidden', muted);
        btn.querySelector('.icon-muted').classList.toggle('hidden', !muted);
        this.showToast(muted ? '已静音' : '已取消静音');
    }

    toggleCamera() {
        const off = this.rtc.toggleCamera();
        const btn = document.getElementById('btn-toggle-camera');
        btn.classList.toggle('active', off);
        btn.querySelector('.icon-camera-on').classList.toggle('hidden', off);
        btn.querySelector('.icon-camera-off').classList.toggle('hidden', !off);
        this.showToast(off ? '摄像头已关' : '摄像头已开');
    }

    endCall() {
        this.rtc.close();
        this.resetUI();
        this.showScreen('welcome');
        this.showToast('已结束');
    }

    updateStatus(state) {
        const dot = document.getElementById('connection-status-dot');
        const text = document.getElementById('connection-status-text');

        dot.classList.remove('connected', 'disconnected');

        if (state === 'connected') {
            dot.classList.add('connected');
            text.textContent = '已连接';
        } else if (state === 'failed' || state === 'disconnected') {
            dot.classList.add('disconnected');
            text.textContent = '已断开';
        } else {
            text.textContent = '连接中...';
        }
    }

    showToast(msg, duration = 3000) {
        const toast = document.getElementById('toast');
        const message = document.getElementById('toast-message');

        message.textContent = msg;
        toast.classList.remove('hidden');
        toast.offsetHeight;
        toast.classList.add('show');

        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }
}

document.addEventListener('DOMContentLoaded', () => window.app = new App());
