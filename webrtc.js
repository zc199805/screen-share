/**
 * WebRTC 管理模块
 * 处理 P2P 连接建立和信令交换
 */

class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.screenStream = null;
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun.nextcloud.com:443' }
            ]
        };

        // 事件回调
        this.onRemoteScreen = null;
        this.onRemoteCamera = null;
        this.onConnectionStateChange = null;
        this.onIceCandidate = null;

        // 内部状态
        this.isHost = false;
        this.isMuted = false;
        this.isCameraOff = false;
    }

    /**
     * 初始化 PeerConnection
     */
    initPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.config);

        // 监听 ICE 候选 (收集网络路径)
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // 有新的候选，这里我们不立即发送，而是等待收集完成一起打包
                // console.log('发现新 ICE 候选:', event.candidate);
            } else {
                // 收集完成
                console.log('ICE 候选收集完成');
                if (this.onIceGatheringComplete && this.peerConnection.localDescription) {
                    this.onIceGatheringComplete(this.peerConnection.localDescription);
                }
            }
        };

        // 监听 ICE 连接状态
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE 连接状态:', this.peerConnection.iceConnectionState);
            if (this.onConnectionStateChange) {
                let state = this.peerConnection.iceConnectionState;
                if (state === 'connected' || state === 'completed') {
                    state = 'connected';
                }
                this.onConnectionStateChange(state);
            }
        };

        // 监听远程流
        this.peerConnection.ontrack = (event) => {
            console.log('收到远程流:', event.track.kind, event.streams[0]);
            const stream = event.streams[0];

            // 简单的流类型判断逻辑
            // 如果是观看端，收到的第一个视频流通常是屏幕
            // 或者通过 track id 或 stream id 判断（如果实现了信令交换元数据）

            // 这里简单处理：如果没有从属关系，都抛出事件，由 UI 层按需显示
            // 实际上对于屏幕共享，通常 Video 是屏幕，第二个 Video 或者是同一个 stream 里的第二个 track 是摄像头

            // 但在这个应用中，为了简单，我们假设：
            // Host 发送 screen (video) + camera (video+audio)
            // Viewer 发送 camera (video+audio)

            // 区分屏幕和摄像头有些复杂，这里简化：
            // 如果只有一路视频，认为是屏幕（Host发给Viewer）或摄像头（Viewer发给Host）
            // 我们通过 event.track.label 或者流的顺序来猜

            if (event.track.kind === 'video') {
                // 这是一个 hack，实际应该通过信令交换 track ID
                // 屏幕共享的 track label 通常包含 "screen" 或显示器名称
                // 摄像头的 track label 通常包含 "camera"

                // 或者简单地：第一个是屏幕，第二个是摄像头
                if (!this.remoteScreenStream && !this.isHost) {
                    this.remoteScreenStream = stream;
                    if (this.onRemoteScreen) this.onRemoteScreen(stream);
                } else {
                    if (this.onRemoteCamera) this.onRemoteCamera(stream);
                }
            } else if (event.track.kind === 'audio') {
                // 音频流，通常附带在摄像头流上
                // 确保它被播放
            }
        };
    }

    /**
     * 获取用户媒体（摄像头和麦克风）
     */
    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, frameRate: 15 }, // 低质量以节省带宽
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            return this.localStream;
        } catch (error) {
            console.error('获取摄像头/麦克风失败:', error);
            // 允许失败，比如用户没有摄像头，或者拒绝权限，不阻碍屏幕共享
            // throw error; 
            return null;
        }
    }

    /**
     * 获取屏幕共享流
     */
    async getScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always"
                },
                audio: true // 尝试获取系统音频
            });

            // 标记这是屏幕共享流
            Object.defineProperty(this.screenStream, 'id', {
                value: 'screen-' + this.screenStream.id,
                writable: false
            });

            // 监听用户停止共享
            this.screenStream.getVideoTracks()[0].onended = () => {
                console.log('用户停止了屏幕共享');
                this.stopScreenShare();
            };

            return this.screenStream;
        } catch (error) {
            console.error('获取屏幕共享失败:', error);
            throw error;
        }
    }

    /**
     * 创建 Offer (共享端使用)
     */
    async createOffer() {
        this.isHost = true;
        this.initPeerConnection();

        // 添加屏幕共享流
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.screenStream);
            });
        }

        // 添加摄像头/麦克风流
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // 创建 Offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // 等待 ICE 候选收集完成
        return new Promise((resolve) => {
            let resolved = false;

            this.onIceGatheringComplete = (description) => {
                if (!resolved) {
                    resolved = true;
                    resolve(this.encodeDescription(description));
                }
            };

            // 安全超时：如果 ICE 收集太慢（超过2秒），就先发送已有的 candidates
            setTimeout(() => {
                if (!resolved && this.peerConnection.localDescription) {
                    console.log('ICE 收集超时，发送当前 Offer');
                    resolved = true;
                    resolve(this.encodeDescription(this.peerConnection.localDescription));
                }
            }, 2000);
        });
    }

    /**
     * 处理 Offer 并创建 Answer (观看端使用)
     */
    async handleOfferAndCreateAnswer(encodedOffer) {
        this.isHost = false;
        this.initPeerConnection();

        // 解码并设置远程描述
        const offer = this.decodeDescription(encodedOffer);
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // 添加摄像头/麦克风流
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // 创建 Answer
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // 等待 ICE 候选收集完成
        return new Promise((resolve) => {
            let resolved = false;

            this.onIceGatheringComplete = (description) => {
                if (!resolved) {
                    resolved = true;
                    resolve(this.encodeDescription(description));
                }
            };

            // 安全超时
            setTimeout(() => {
                if (!resolved && this.peerConnection.localDescription) {
                    console.log('ICE 收集超时，发送当前 Answer');
                    resolved = true;
                    resolve(this.encodeDescription(this.peerConnection.localDescription));
                }
            }, 2000);
        });
    }

    /**
     * 编码 SDP 描述 (使用 LZString 压缩)
     */
    encodeDescription(description) {
        try {
            const data = {
                t: description.type === 'offer' ? 'o' : 'a',
                s: description.sdp
            };
            const json = JSON.stringify(data);

            // 检查 LZString 是否加载
            if (typeof LZString !== 'undefined' && LZString.compressToBase64) {
                return LZString.compressToBase64(json);
            }

            console.warn('LZString 未加载，使用普通 Base64');
            return btoa(unescape(encodeURIComponent(json)));

        } catch (e) {
            console.error('编码失败:', e);
            // 降级方案
            try {
                const data = { type: description.type, sdp: description.sdp };
                return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
            } catch (err) {
                throw new Error('生成连接码失败: ' + err.message);
            }
        }
    }

    /**
     * 解码 SDP 描述 (使用 LZString 解压)
     */
    decodeDescription(encoded) {
        try {
            const cleanEncoded = encoded.trim().replace(/\s/g, '');
            if (!cleanEncoded) throw new Error('连接码为空');

            let json = null;

            // 1. 尝试 LZString 解压
            if (typeof LZString !== 'undefined' && LZString.decompressFromBase64) {
                json = LZString.decompressFromBase64(cleanEncoded);
            }

            // 2. 如果失败，尝试普通 Base64 解码
            if (!json) {
                try {
                    json = decodeURIComponent(escape(atob(cleanEncoded)));
                } catch (e) {
                    // 忽略
                }
            }

            if (!json) throw new Error('无法解码连接码');

            const data = JSON.parse(json);
            if (!data) throw new Error('数据为空');

            return {
                type: (data.t === 'o' || data.type === 'offer') ? 'offer' : 'answer',
                sdp: data.s || data.sdp
            };
        } catch (error) {
            console.error('解码失败:', error);
            throw new Error('无效的连接码: ' + error.message);
        }
    }

    /**
     * 处理 Answer (共享端使用)
     */
    async handleAnswer(encodedAnswer) {
        const answer = this.decodeDescription(encodedAnswer);
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    /**
     * 切换静音状态
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
        }
        return this.isMuted;
    }

    /**
     * 切换摄像头状态
     */
    toggleCamera() {
        this.isCameraOff = !this.isCameraOff;
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = !this.isCameraOff;
            });
        }
        return this.isCameraOff;
    }

    /**
     * 停止屏幕共享
     */
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        // 这里应该通知 UI 重置
        // 比如 window.location.reload(); 或者触发一个事件
    }

    /**
     * 关闭连接
     */
    close() {
        this.stopScreenShare();
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }
}

// 导出全局实例
window.webrtcManager = new WebRTCManager();
