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

        // ICE 服务器配置 - 使用国内可用的服务器
        this.iceServers = {
            iceServers: [
                // 国内可用的 STUN 服务器
                { urls: 'stun:stun.miwifi.com:3478' },        // 小米
                { urls: 'stun:stun.hitv.com:3478' },          // 芒果TV  
                { urls: 'stun:stun.chat.bilibili.com:3478' }, // B站
                // 备用国际 STUN
                { urls: 'stun:stun.stunprotocol.org:3478' },
                // 免费 TURN 服务器 (metered.ca - 20GB/月免费额度)
                {
                    urls: 'turn:a.relay.metered.ca:80',
                    username: 'e13b6bfce53f06c5e46a7882',
                    credential: 'sxwgTzsLJ0Kx40Vp'
                },
                {
                    urls: 'turn:a.relay.metered.ca:443',
                    username: 'e13b6bfce53f06c5e46a7882',
                    credential: 'sxwgTzsLJ0Kx40Vp'
                },
                {
                    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
                    username: 'e13b6bfce53f06c5e46a7882',
                    credential: 'sxwgTzsLJ0Kx40Vp'
                }
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
     * 压缩 SDP - 激进模式
     */
    compressSDP(sdp) {
        return sdp
            // 移除非必要行
            .replace(/a=extmap:[^\r\n]+\r\n/g, '')
            .replace(/a=rtcp-fb:[^\r\n]+\r\n/g, '')
            .replace(/a=ssrc-group:[^\r\n]+\r\n/g, '')
            // 简化 ssrc 只保留 cname (Chrome需要)
            .replace(/a=ssrc:(\d+) msid:[^\r\n]+\r\n/g, '')
            .replace(/a=ssrc:(\d+) mslabel:[^\r\n]+\r\n/g, '')
            .replace(/a=ssrc:(\d+) label:[^\r\n]+\r\n/g, '')
            // 移除 Google 特有扩展
            .replace(/a=goog-[^\r\n]+\r\n/g, '')
            // 移除空行
            .replace(/\r\n\r\n+/g, '\r\n');
    }

    /**
     * 编码 SDP 描述 (使用 Gzip 压缩)
     */
    encodeDescription(description) {
        const compressedSDP = this.compressSDP(description.sdp);

        const data = {
            t: description.type === 'offer' ? 'o' : 'a',
            s: compressedSDP
        };
        const jsonString = JSON.stringify(data);

        try {
            // 使用 pako 进行 gzip 压缩
            if (window.pako) {
                const binary = pako.gzip(jsonString);
                // Uint8Array 转二进制字符串
                let binaryString = '';
                const len = binary.byteLength;
                for (let i = 0; i < len; i++) {
                    binaryString += String.fromCharCode(binary[i]);
                }
                // Base64 编码
                return btoa(binaryString);
            }
        } catch (e) {
            console.error('Gzip压缩失败:', e);
        }

        // 降级方案
        return btoa(unescape(encodeURIComponent(jsonString)));
    }

    /**
     * 解码 SDP 描述 (支持 Gzip)
     */
    decodeDescription(encoded) {
        try {
            const cleanEncoded = encoded.trim().replace(/\s/g, '');
            if (!cleanEncoded) throw new Error('连接码为空');

            const binaryString = atob(cleanEncoded);

            // 尝试 Gzip 解压
            if (window.pako) {
                try {
                    const charData = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        charData[i] = binaryString.charCodeAt(i);
                    }
                    const data = JSON.parse(pako.ungzip(charData, { to: 'string' }));
                    return this.parseData(data);
                } catch (e) {
                    // console.log('非Gzip数据，尝试普通解析');
                }
            }

            // 普通解析 (兼容旧版)
            const json = decodeURIComponent(escape(binaryString));
            const data = JSON.parse(json);
            return this.parseData(data);

        } catch (error) {
            console.error('解码失败:', error);
            throw new Error('无效的连接码');
        }
    }

    parseData(data) {
        if (data.t && data.s) {
            return {
                type: data.t === 'o' ? 'offer' : 'answer',
                sdp: data.s
            };
        }
        if (data.type && data.sdp) return data;
        throw new Error('数据格式错误');
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
