const THREE = window.THREE;

// Configuração inicial
let scene, camera, renderer, ocean, player;
let clock = new THREE.Clock();
let collectibles = 0;
let islands = [];
let shark = null;
let aurora = null;
let isNight = false;
let peer;
let connections = new Map();
let remotePlayers = new Map();

// Configurações do jogador
const PLAYER_STATES = {
    SURFBOARD: { size: [2, 0.2, 1], color: 0x8B4513, speed: 0.1 },
    KAYAK: { size: [3, 0.5, 1], color: 0x404040, speed: 0.2 },
    BOAT: { size: [4, 1, 2], color: 0x4682B4, speed: 0.3 }
};

// Adicionar após as configurações iniciais
let score = 0;
let audioListener;
let sounds = {};
let particleSystem;

// Adicionar após os shaders
const particleShader = {
    vertexShader: `
        uniform float time;
        attribute float size;
        varying vec3 vColor;
        void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        void main() {
            if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) discard;
            gl_FragColor = vec4(vColor, 1.0);
        }
    `
};

// Adicionar após as configurações iniciais
const waterShader = {
    uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x006994) }
    },
    vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        
        float generateNoise(vec2 p) {
            return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        void main() {
            vUv = uv;
            vec3 pos = position;
            float noiseVal = generateNoise(pos.xz * 0.1 + time * 0.1);
            pos.y += sin(pos.x * 0.2 + time) * 0.5;
            pos.y += cos(pos.z * 0.2 + time) * 0.5;
            pos.y += noiseVal * 0.5;
            vElevation = pos.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 waterColor;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
            float alpha = 0.8 - vElevation * 0.1;
            gl_FragColor = vec4(waterColor + vElevation * 0.1, alpha);
        }
    `
};

const auroraShader = {
    uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color(0x00ff00) },
        color2: { value: new THREE.Color(0x4B0082) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec2 vUv;
        
        void main() {
            float noise = sin(vUv.y * 10.0 + time) * 0.5 + 0.5;
            vec3 color = mix(color1, color2, noise);
            float alpha = smoothstep(0.3, 0.7, noise) * 0.6;
            gl_FragColor = vec4(color, alpha);
        }
    `
};

function init() {
    // Configuração da cena
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    createOcean();
    createPlayer();
    createIslands();
    initMultiplayer();

    // Posição inicial da câmera
    camera.position.set(0, 5, 10);
    camera.lookAt(player.position);

    // Inicializar áudio
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    loadSounds();
    createParticleSystem();
    
    // Adicionar display de pontuação
    createScoreDisplay();

    animate();
}

function createOcean() {
    const geometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    const material = new THREE.ShaderMaterial({
        uniforms: waterShader.uniforms,
        vertexShader: waterShader.vertexShader,
        fragmentShader: waterShader.fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
    ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2;
    scene.add(ocean);
}

function createPlayer() {
    const { size, color } = PLAYER_STATES.SURFBOARD;
    const geometry = new THREE.BoxGeometry(...size);
    const material = new THREE.MeshPhongMaterial({ color });
    player = new THREE.Mesh(geometry, material);
    player.position.y = 0.5;
    scene.add(player);
}

function createIslands() {
    for (let i = 0; i < 5; i++) {
        const geometry = new THREE.SphereGeometry(2, 8, 6);
        const material = new THREE.MeshPhongMaterial({ color: 0x228B22 });
        const island = new THREE.Mesh(geometry, material);
        
        island.position.x = Math.random() * 100 - 50;
        island.position.z = Math.random() * 100 - 50;
        island.position.y = 1;
        island.userData.lastCollected = 0;
        
        islands.push(island);
        scene.add(island);
    }
}

function handleMovement() {
    const currentState = collectibles >= 6 ? PLAYER_STATES.BOAT :
                        collectibles >= 3 ? PLAYER_STATES.KAYAK :
                        PLAYER_STATES.SURFBOARD;

    if (keys.w) player.position.z -= currentState.speed;
    if (keys.s) player.position.z += currentState.speed;
    if (keys.a) player.position.x -= currentState.speed;
    if (keys.d) player.position.x += currentState.speed;

    // Atualiza a câmera
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);
}

// Sistema de controle
const keys = { w: false, a: false, s: false, d: false };
document.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function checkCollisions() {
    islands.forEach(island => {
        const distance = player.position.distanceTo(island.position);
        const now = Date.now();
        
        if (distance < 3 && now - island.userData.lastCollected > 5000) {
            collectibles++;
            score += 100;
            updateScoreDisplay();
            
            if (sounds.collect) {
                sounds.collect.play();
            }
            
            island.userData.lastCollected = now;
            
            const items = ['concha', 'madeira', 'garrafa', 'pérola', 'rede'];
            const item = items[Math.floor(Math.random() * items.length)];
            console.log(`Item coletado: ${item}`);
            
            createCollectEffect(island.position);
            updatePlayerVehicle();
        }
    });
}

function updatePlayerVehicle() {
    const newState = collectibles >= 6 ? PLAYER_STATES.BOAT :
                    collectibles >= 3 ? PLAYER_STATES.KAYAK :
                    PLAYER_STATES.SURFBOARD;

    player.geometry.dispose();
    player.geometry = new THREE.BoxGeometry(...newState.size);
    player.material.color.setHex(newState.color);
}

function initMultiplayer() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        console.log('Meu ID:', id);
    });

    peer.on('connection', (conn) => {
        handleConnection(conn);
    });
}

function handleConnection(conn) {
    connections.set(conn.peer, conn);
    
    conn.on('data', (data) => {
        updateRemotePlayer(conn.peer, data);
    });
}

function updateRemotePlayer(peerId, data) {
    let remoteMesh = remotePlayers.get(peerId);
    
    if (!remoteMesh) {
        const geometry = new THREE.BoxGeometry(2, 0.2, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x808080, transparent: true, opacity: 0.5 });
        remoteMesh = new THREE.Mesh(geometry, material);
        scene.add(remoteMesh);
        remotePlayers.set(peerId, remoteMesh);
    }
    
    remoteMesh.position.copy(data.position);
    remoteMesh.rotation.copy(data.rotation);
}

function createShark() {
    const geometry = new THREE.BoxGeometry(5, 0.5, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x000080 });
    shark = new THREE.Mesh(geometry, material);
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 25;
    shark.position.x = player.position.x + Math.cos(angle) * distance;
    shark.position.z = player.position.z + Math.sin(angle) * distance;
    shark.position.y = 0.5;
    
    scene.add(shark);
    
    setTimeout(() => {
        scene.remove(shark);
        shark = null;
    }, 30000);

    if (sounds.shark) {
        sounds.shark.play();
    }
}

function createAurora() {
    const geometry = new THREE.PlaneGeometry(200, 50);
    const material = new THREE.ShaderMaterial({
        uniforms: auroraShader.uniforms,
        vertexShader: auroraShader.vertexShader,
        fragmentShader: auroraShader.fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    aurora = new THREE.Mesh(geometry, material);
    aurora.position.set(player.position.x, 100, player.position.z);
    aurora.rotation.x = Math.PI / 3;
    scene.add(aurora);
    
    setTimeout(() => {
        scene.remove(aurora);
        aurora = null;
    }, 30000);
}

function updateDayNightCycle() {
    const time = clock.getElapsedTime() * 0.1;
    const dayColor = new THREE.Color(0x87CEEB);
    const nightColor = new THREE.Color(0x000033);
    
    isNight = Math.sin(time) < 0;
    const currentColor = isNight ? nightColor : dayColor;
    scene.background = currentColor;
    
    // Chance de aparecer aurora durante a noite
    if (isNight && !aurora && Math.random() < 0.001 && player.position.x > 50) {
        createAurora();
    }
}

function updateShark() {
    if (shark) {
        const time = clock.getElapsedTime();
        const radius = 10;
        const centerX = shark.userData.centerX;
        const centerZ = shark.userData.centerZ;
        
        shark.position.x = centerX + Math.cos(time) * radius;
        shark.position.z = centerZ + Math.sin(time) * radius;
        shark.rotation.y = time;
        
        const distanceToPlayer = shark.position.distanceTo(player.position);
        if (distanceToPlayer < 5) {
            const currentState = collectibles >= 6 ? 0.2 : 1.0;
            player.position.y = 0.5 + Math.sin(time * 5) * currentState;
        }
    } else if (Math.random() < 0.0008) { // Aproximadamente 5% por minuto
        createShark();
    }
}

function loadSounds() {
    const audioLoader = new THREE.AudioLoader();
    
    sounds.waves = new THREE.Audio(audioListener);
    audioLoader.load('https://assets.mixkit.co/sfx/preview/mixkit-sea-waves-loop-1196.mp3', (buffer) => {
        sounds.waves.setBuffer(buffer);
        sounds.waves.setLoop(true);
        sounds.waves.setVolume(0.3);
        sounds.waves.play();
    });
    
    sounds.collect = new THREE.Audio(audioListener);
    audioLoader.load('https://assets.mixkit.co/sfx/preview/mixkit-positive-interface-beep-221.mp3', (buffer) => {
        sounds.collect.setBuffer(buffer);
        sounds.collect.setVolume(0.5);
    });
    
    sounds.shark = new THREE.Audio(audioListener);
    audioLoader.load('https://assets.mixkit.co/sfx/preview/mixkit-horror-lose-2028.mp3', (buffer) => {
        sounds.shark.setBuffer(buffer);
        sounds.shark.setVolume(0.4);
    });
}

function createParticleSystem() {
    const geometry = new THREE.BufferGeometry();
    const particles = 1000;
    
    const positions = new Float32Array(particles * 3);
    const colors = new Float32Array(particles * 3);
    const sizes = new Float32Array(particles);
    
    for (let i = 0; i < particles; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 50 + 75;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        
        colors[i * 3] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 1] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 2] = Math.random();
        
        sizes[i] = Math.random() * 2;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: particleShader.vertexShader,
        fragmentShader: particleShader.fragmentShader,
        transparent: true,
        vertexColors: true
    });
    
    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

function createScoreDisplay() {
    const scoreDiv = document.createElement('div');
    scoreDiv.style.position = 'absolute';
    scoreDiv.style.top = '20px';
    scoreDiv.style.left = '20px';
    scoreDiv.style.color = 'white';
    scoreDiv.style.fontSize = '24px';
    scoreDiv.style.fontFamily = 'Arial';
    scoreDiv.id = 'score';
    document.body.appendChild(scoreDiv);
    updateScoreDisplay();
}

function updateScoreDisplay() {
    document.getElementById('score').textContent = `Pontuação: ${score}`;
}

function createCollectEffect(position) {
    const geometry = new THREE.BufferGeometry();
    const particles = 50;
    
    const positions = new Float32Array(particles * 3);
    const velocities = [];
    
    for (let i = 0; i < particles; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = Math.random() * 0.5 + 0.5;
        velocities.push({
            x: Math.cos(angle) * speed,
            y: Math.random() * 2,
            z: Math.sin(angle) * speed
        });
        
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xffff00,
        size: 0.5,
        transparent: true
    });
    
    const points = new THREE.Points(geometry, material);
    points.userData.velocities = velocities;
    points.userData.lifetime = 1;
    scene.add(points);
    
    setTimeout(() => {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
    }, 1000);
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Atualizar uniforms dos shaders
    if (ocean.material.uniforms) {
        ocean.material.uniforms.time.value = time;
    }
    if (aurora && aurora.material.uniforms) {
        aurora.material.uniforms.time.value = time;
    }
    
    handleMovement();
    checkCollisions();
    updateDayNightCycle();
    updateShark();
    
    // Atualizar posição da aurora se existir
    if (aurora) {
        aurora.position.x = player.position.x;
        aurora.position.z = player.position.z;
    }
    
    // Atualizar partículas
    if (particleSystem) {
        particleSystem.material.uniforms.time.value = time;
        particleSystem.rotation.y = time * 0.05;
    }
    
    // Atualizar efeitos de coleta
    scene.children.forEach(child => {
        if (child instanceof THREE.Points && child.userData.velocities) {
            const positions = child.geometry.attributes.position.array;
            const velocities = child.userData.velocities;
            
            for (let i = 0; i < velocities.length; i++) {
                positions[i * 3] += velocities[i].x;
                positions[i * 3 + 1] += velocities[i].y;
                positions[i * 3 + 2] += velocities[i].z;
                velocities[i].y -= 0.05;
            }
            
            child.geometry.attributes.position.needsUpdate = true;
            child.material.opacity = child.userData.lifetime;
            child.userData.lifetime -= 0.02;
        }
    });
    
    // Envia posição para outros jogadores
    connections.forEach(conn => {
        conn.send({
            position: player.position,
            rotation: player.rotation
        });
    });
    
    renderer.render(scene, camera);
}

// Inicializa o jogo
init();

// Ajusta o tamanho da janela
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}); 