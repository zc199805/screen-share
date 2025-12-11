/**
 * Firebase 信令模块 - 用于交换连接信息
 * 使用6位房间码代替长连接码
 */

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyAUeM2Q6Bfv4BBKKuXB1vQXkgzXDxkrq9g",
    authDomain: "screen-share-b7102.firebaseapp.com",
    databaseURL: "https://screen-share-b7102-default-rtdb.firebaseio.com",
    projectId: "screen-share-b7102",
    storageBucket: "screen-share-b7102.firebasestorage.app",
    messagingSenderId: "510726143086",
    appId: "1:510726143086:web:0d4e809a9493234f663a7f"
};

class FirebaseSignaling {
    constructor() {
        this.db = null;
        this.roomRef = null;
        this.roomCode = null;
        this.isHost = false;
        this.initialized = false;

        // 回调函数
        this.onAnswerReceived = null;
        this.onOfferReceived = null;
        this.onError = null;
    }

    /**
     * 初始化 Firebase
     */
    async init() {
        if (this.initialized) return;

        try {
            // 动态加载 Firebase SDK
            if (!window.firebase) {
                await this.loadFirebaseSDK();
            }

            // 初始化 Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            this.db = firebase.database();
            this.initialized = true;
            console.log('Firebase 初始化成功');
        } catch (error) {
            console.error('Firebase 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 动态加载 Firebase SDK
     */
    loadFirebaseSDK() {
        return new Promise((resolve, reject) => {
            // Firebase App
            const script1 = document.createElement('script');
            script1.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
            script1.onload = () => {
                // Firebase Database
                const script2 = document.createElement('script');
                script2.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js';
                script2.onload = resolve;
                script2.onerror = reject;
                document.head.appendChild(script2);
            };
            script1.onerror = reject;
            document.head.appendChild(script1);
        });
    }

    /**
     * 生成6位房间码
     */
    generateRoomCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * 创建房间（共享端使用）
     */
    async createRoom(offer) {
        await this.init();

        this.isHost = true;
        this.roomCode = this.generateRoomCode();
        this.roomRef = this.db.ref('rooms/' + this.roomCode);

        // 设置房间数据
        await this.roomRef.set({
            offer: offer,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        // 监听回复
        this.roomRef.child('answer').on('value', (snapshot) => {
            const answer = snapshot.val();
            if (answer && this.onAnswerReceived) {
                this.onAnswerReceived(answer);
            }
        });

        // 30分钟后自动删除房间
        setTimeout(() => this.deleteRoom(), 30 * 60 * 1000);

        return this.roomCode;
    }

    /**
     * 加入房间（观看端使用）
     */
    async joinRoom(roomCode) {
        await this.init();

        this.isHost = false;
        this.roomCode = roomCode;
        this.roomRef = this.db.ref('rooms/' + roomCode);

        // 获取房间数据
        const snapshot = await this.roomRef.once('value');
        const roomData = snapshot.val();

        if (!roomData) {
            throw new Error('房间不存在或已过期');
        }

        if (!roomData.offer) {
            throw new Error('房间数据无效');
        }

        return roomData.offer;
    }

    /**
     * 发送回复（观看端使用）
     */
    async sendAnswer(answer) {
        if (!this.roomRef) {
            throw new Error('未加入房间');
        }

        await this.roomRef.child('answer').set(answer);
    }

    /**
     * 删除房间
     */
    async deleteRoom() {
        if (this.roomRef) {
            try {
                await this.roomRef.remove();
            } catch (e) {
                console.log('删除房间失败:', e);
            }
            this.roomRef = null;
        }
        this.roomCode = null;
    }

    /**
     * 清理
     */
    cleanup() {
        if (this.roomRef) {
            this.roomRef.off();
        }
        this.deleteRoom();
    }
}

// 导出单例
window.firebaseSignaling = new FirebaseSignaling();
