/**
 * WebRTC Module - P2P 连接核心
 * 实现无服务器的点对点连接
 */

class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;        // 本地摄像头/麦克风流
        this.screenStream = null;       // 屏幕共享流
        this.remoteScreenStream = null; // 远程屏幕流
        this.remoteCameraStream = null; // 远程摄像头流
        this.dataChannel = null;

        this.isHost = false;
        this.isMuted = false;
        this.isCameraOff = false;

        // 回调函数
        this.onRemoteScreen = null;
        this.onRemoteCamera = null;
        this.onConnectionStateChange = null;
        this.onIceGatheringComplete = null;

        // ICE 服务器配置 (使用免费的公共 STUN 服务器)
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        };
    }

    /**
     * 初始化 RTCPeerConnection
     */
    initPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // 监听远程流
        this.peerConnection.ontrack = (event) => {
            console.log('收到远程流:', event.track.kind, event.streams);

            const stream = event.streams[0];
            const track = event.track;

            // 根据流的ID或标签区分屏幕共享流和摄像头流
            if (stream.id.includes('screen') || track.label.includes('screen')) {
                this.remoteScreenStream = stream;
                if (this.onRemoteScreen) {
                    this.onRemoteScreen(stream);
                }
            } else {
                // 检查是视频还是音频
                if (track.kind === 'video') {
                    if (!this.remoteCameraStream) {
                        this.remoteCameraStream = new MediaStream();
                    }
                    this.remoteCameraStream.addTrack(track);
                    if (this.onRemoteCamera) {
                        this.onRemoteCamera(this.remoteCameraStream);
                    }
                } else if (track.kind === 'audio') {
                    // 音频轨道添加到摄像头流
                    if (this.remoteCameraStream) {
                        this.remoteCameraStream.addTrack(track);
                    }
                }
            }
        };

        // 监听连接状态变化
        this.peerConnection.onconnectionstatechange = () => {
            console.log('连接状态:', this.peerConnection.connectionState);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.peerConnection.connectionState);
            }
        };

        // 监听 ICE 连接状态
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE 连接状态:', this.peerConnection.iceConnectionState);
        };

        // 监听 ICE 候选收集
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate === null) {
                console.log('ICE 候选收集完成');
                if (this.onIceGatheringComplete) {
                    this.onIceGatheringComplete(this.peerConnection.localDescription);
                }
            }
        };
    }

    /**
     * 获取摄像头和麦克风权限
     */
    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            return this.localStream;
        } catch (error) {
            console.error('获取摄像头/麦克风失败:', error);
            throw error;
        }
    }

    /**
     * 获取屏幕共享权限
     */
    async getScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor'
                },
                audio: true  // 尝试获取系统音频
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
            this.onIceGatheringComplete = (description) => {
                resolve(this.encodeDescription(description));
            };

            // 超时处理
            setTimeout(() => {
                if (this.peerConnection.localDescription) {
                    resolve(this.encodeDescription(this.peerConnection.localDescription));
                }
            }, 5000);
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
            this.onIceGatheringComplete = (description) => {
                resolve(this.encodeDescription(description));
            };

            // 超时处理
            setTimeout(() => {
                if (this.peerConnection.localDescription) {
                    resolve(this.encodeDescription(this.peerConnection.localDescription));
                }
            }, 5000);
        });
    }

    /**
     * 处理 Answer (共享端使用)
     */
    async handleAnswer(encodedAnswer) {
        const answer = this.decodeDescription(encodedAnswer);
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    /**
     * 编码 SDP 描述 (不再压缩，保持完整以确保兼容性)
     */
    encodeDescription(description) {
        // 不再压缩SDP，保持完整以确保跨浏览器兼容性
        const data = {
            t: description.type === 'offer' ? 'o' : 'a',
            s: description.sdp
        };

        const json = JSON.stringify(data);
        // 使用 Base64 编码
        return btoa(unescape(encodeURIComponent(json)));
    }

    /**
     * 解码 SDP 描述
     */
    decodeDescription(encoded) {
        try {
            // 清理输入（移除空格和换行）
            const cleanEncoded = encoded.trim().replace(/\s/g, '');
            const json = decodeURIComponent(escape(atob(cleanEncoded)));
            const data = JSON.parse(json);

            // 兼容旧格式
            if (data.type && data.sdp) {
                return data;
            }

            // 新格式
            return {
                type: data.t === 'o' ? 'offer' : 'answer',
                sdp: data.s
            };
        } catch (error) {
            console.error('解码失败:', error);
            throw new Error('无效的连接码');
        }
    }

    /**
     * 切换静音状态
     */
    toggleMute() {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            this.isMuted = !this.isMuted;
        }
        return this.isMuted;
    }

    /**
     * 切换摄像头状态
     */
    toggleCamera() {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            this.isCameraOff = !this.isCameraOff;
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
    }

    /**
     * 关闭连接
     */
    close() {
        // 停止所有媒体流
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // 关闭 RTCPeerConnection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteScreenStream = null;
        this.remoteCameraStream = null;
        this.isHost = false;
        this.isMuted = false;
        this.isCameraOff = false;
    }

    /**
     * 获取连接状态
     */
    getConnectionState() {
        return this.peerConnection ? this.peerConnection.connectionState : 'closed';
    }
}

// 导出单例
window.webrtcManager = new WebRTCManager();

