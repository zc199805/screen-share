/**
 * Screen Share Together - 主应用逻辑
 * 使用Firebase房间码实现简单连接
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
        // Firebase 信令
        this.signaling = window.firebaseSignaling;

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
        document.getElementById('btn-copy-room-code').addEventListener('click', () => this.copyRoomCode());

        // 观看端按钮
        document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());

        // 房间码输入框 - 只允许数字
        const roomCodeInput = document.getElementById('viewer-room-code');
        roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });

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

            // 连接成功后切换到通话界面
            if (state === 'connected') {
                this.showScreen('call');
                this.showToast('连接成功！');
            }
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
        this.signaling.cleanup();
        this.resetUI();
        this.showScreen('welcome');
    }

    /**
     * 重置 UI 状态
     */
    resetUI() {
        // 重置共享端
        document.querySelectorAll('#host-screen .step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index === 0) step.classList.add('active');
        });
        document.getElementById('host-room-code').textContent = '------';
        document.getElementById('host-status').textContent = '等待朋友加入...';
        document.getElementById('host-preview').classList.add('hidden');

        // 重置观看端
        document.getElementById('viewer-room-code').value = '';
        document.getElementById('viewer-status').textContent = '';

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
            // 检测设备是否支持屏幕共享
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

                if (isMobile) {
                    this.showToast('📱 手机不支持屏幕共享，请使用电脑', 5000);
                    alert('当前设备不支持屏幕共享\n\n请在电脑上打开此网址共享屏幕\n手机可以作为观看端使用');
                } else {
                    this.showToast('浏览器不支持屏幕共享，请使用 Chrome', 5000);
                }
                return;
            }

            this.showToast('正在获取屏幕共享权限...');

            // 获取屏幕共享
            const screenStream = await this.rtc.getScreenShare();

            // 获取摄像头/麦克风
            const cameraStream = await this.rtc.getUserMedia();

            // 显示本地预览
            document.getElementById('local-screen-preview').srcObject = screenStream;
            document.getElementById('local-camera-preview').srcObject = cameraStream;
            document.getElementById('host-preview').classList.remove('hidden');

            // 创建 WebRTC Offer
            this.showToast('正在创建房间...');
            const offer = await this.rtc.createOffer();

            // 创建 Firebase 房间
            const roomCode = await this.signaling.createRoom(offer);

            // 显示房间码
            document.getElementById('host-room-code').textContent = roomCode;

            // 更新步骤状态
            document.getElementById('host-step-1').classList.remove('active');
            document.getElementById('host-step-1').classList.add('completed');
            document.getElementById('host-step-2').classList.add('active');

            this.showToast('房间创建成功！房间码: ' + roomCode);

            // 监听朋友加入
            this.signaling.onAnswerReceived = async (answer) => {
                try {
                    document.getElementById('host-status').textContent = '朋友已加入，正在连接...';
                    await this.rtc.handleAnswer(answer);

                    // 设置本地摄像头到通话界面
                    document.getElementById('local-camera').srcObject = this.rtc.localStream;

                } catch (error) {
                    console.error('处理回复失败:', error);
                    this.showToast('连接失败: ' + error.message);
                }
            };

        } catch (error) {
            console.error('开始共享失败:', error);

            if (error.name === 'NotAllowedError') {
                this.showToast('您取消了屏幕共享权限');
            } else {
                this.showToast('无法开始共享: ' + error.message);
            }
        }
    }

    /**
     * 复制房间码
     */
    async copyRoomCode() {
        const roomCode = document.getElementById('host-room-code').textContent;

        if (roomCode === '------') {
            this.showToast('还没有房间码');
            return;
        }

        try {
            await navigator.clipboard.writeText(roomCode);
            this.showToast('房间码已复制: ' + roomCode);
        } catch (error) {
            this.showToast('复制失败，请手动复制: ' + roomCode);
        }
    }

    /**
     * 观看端：加入房间
     */
    async joinRoom() {
        const roomCode = document.getElementById('viewer-room-code').value.trim();
        const statusEl = document.getElementById('viewer-status');

        if (!roomCode || roomCode.length !== 6) {
            this.showToast('请输入6位房间码');
            return;
        }

        try {
            statusEl.textContent = '正在加入房间...';
            statusEl.style.color = '#f59e0b';

            // 获取摄像头/麦克风
            await this.rtc.getUserMedia();

            // 加入房间获取 Offer
            const offer = await this.signaling.joinRoom(roomCode);

            statusEl.textContent = '正在建立连接...';

            // 处理 Offer 并创建 Answer
            const answer = await this.rtc.handleOfferAndCreateAnswer(offer);

            // 发送 Answer
            await this.signaling.sendAnswer(answer);

            statusEl.textContent = '连接中，请稍候...';
            statusEl.style.color = '#22c55e';

            // 设置本地摄像头到通话界面
            document.getElementById('local-camera').srcObject = this.rtc.localStream;

        } catch (error) {
            console.error('加入房间失败:', error);
            statusEl.textContent = '加入失败: ' + error.message;
            statusEl.style.color = '#ef4444';
            this.showToast('加入房间失败: ' + error.message);
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
        this.signaling.cleanup();
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
