import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { PMREMGenerator } from 'three';

// Variáveis globais
let scene, camera, renderer, controls;
let ocean, skybox;
let kayak, paddleLeft, paddleRight;
let clock = new THREE.Clock();
let velocity = new THREE.Vector3();
let waveUniforms = { uTime: { value: 0 } };
let player; // Boneco do jogador
let lighthouse; // Farol

// Controles do jogador
const keys = { w: false, a: false, s: false, d: false, shift: false };
const params = {
    acceleration: 0.0005,
    damping: 0.98,
    turnSpeed: 0.02,
    maxSpeed: 0.05,
    waveHeight: 0.2,
    waveFrequency: 2.0,
    fogDensity: 0.02
};

// Inicialização
init();

function init() {
    // Criar cena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x001e3c);
    
    // Adicionar neblina
    scene.fog = new THREE.FogExp2(0x001e3c, params.fogDensity);
    
    // Configurar câmera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
    
    // Configurar renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    
    // Adicionar controles para depuração
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    
    // Luzes
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, 10);
    scene.add(directionalLight);
    
    // Carregar texturas - apenas o HDR
    const textures = loadTextures();
    
    // Criar elementos do jogo
    createSkybox(textures);
    createOcean();
    createKayak();
    
    // Capturar entrada do teclado
    setupKeyboardControls();
    
    // Redimensionar
    window.addEventListener('resize', onWindowResize);
    
    // Esconder a tela de carregamento manualmente
    document.getElementById('loading').style.display = 'none';
    
    // Adicionar farol em posição aleatória
    lighthouse = createLighthouse();
    
    // Gerar posição aleatória (entre -50 e 50, mas não muito perto do ponto inicial)
    let lighthouseX, lighthouseZ;
    do {
        lighthouseX = (Math.random() * 100) - 50;
        lighthouseZ = (Math.random() * 100) - 50;
    } while (Math.sqrt(lighthouseX * lighthouseX + lighthouseZ * lighthouseZ) < 20);
    
    lighthouse.position.set(lighthouseX, 0, lighthouseZ);
    scene.add(lighthouse);
    
    // Iniciar animação
    animate();
}

function loadTextures() {
    return {
        hdrPath: 'textures/skybox/kloofendal_48d_partly_cloudy_puresky_2k.hdr'
    };
}

function createSkybox(textures) {
    // Criar uma esfera grande para o skybox
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // Virar a esfera ao contrário
    
    // Material básico
    const material = new THREE.MeshBasicMaterial({
        side: THREE.BackSide
    });
    
    skybox = new THREE.Mesh(geometry, material);
    scene.add(skybox);
    
    // Carregar o arquivo HDR
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(textures.hdrPath, function(texture) {
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        
        // Aplicar ao background da cena
        scene.background = envMap;
        
        // Aplicar ao skybox
        skybox.material.envMap = envMap;
        skybox.material.needsUpdate = true;
        
        // Liberar recursos
        texture.dispose();
        pmremGenerator.dispose();
        
        console.log("Skybox HDR carregado com sucesso");
    });
}

function createOcean() {
    // Criar geometria do oceano
    const geometry = new THREE.PlaneGeometry(200, 200, 100, 100);
    
    // Shader para animação das ondas
    const vertexShader = `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            vUv = uv;
            vPosition = position;
            
            float waveHeight = 0.2;
            float waveSpeed = 1.5;
            float frequency = 2.0;
            
            // Ondas principais
            float wave1 = sin(position.x * frequency + uTime * waveSpeed) * waveHeight;
            float wave2 = cos(position.y * frequency + uTime * waveSpeed * 0.8) * waveHeight;
            
            // Combinar ondas
            float totalWave = wave1 + wave2;
            
            // Aplicar deslocamento
            vec3 newPosition = position;
            newPosition.z += totalWave;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
    `;
    
    const fragmentShader = `
        varying vec2 vUv;
        
        void main() {
            // Cores do oceano
            vec3 shallowColor = vec3(0.0, 0.6, 0.8);
            vec3 deepColor = vec3(0.0, 0.2, 0.5);
            
            // Profundidade com base na posição
            float depth = clamp(vUv.y, 0.0, 1.0);
            
            // Misturar cores com base na profundidade
            vec3 finalColor = mix(shallowColor, deepColor, depth);
            
            gl_FragColor = vec4(finalColor, 0.8);
        }
    `;
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);
    
    console.log("Oceano básico criado com sucesso");
}

function createKayak() {
    // Criar grupo para o caiaque
    kayak = new THREE.Group();
    
    // Corpo do caiaque
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 8, 16);
    bodyGeometry.rotateZ(Math.PI / 2);
    
    // Achatamento do caiaque
    const bodyVertices = bodyGeometry.attributes.position;
    for (let i = 0; i < bodyVertices.count; i++) {
        bodyVertices.setY(i, bodyVertices.getY(i) * 0.4);
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0xFF4500,
        shininess: 80
    });
    
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.2;
    kayak.add(body);
    
    // Assento do caiaque
    const seatGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const seatMaterial = new THREE.MeshPhongMaterial({
        color: 0x333333
    });
    
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.y = 0.3;
    kayak.add(seat);
    
    // Criar remos
    paddleLeft = createPaddle();
    paddleLeft.position.set(-0.4, 0.3, 0);
    paddleLeft.rotation.x = Math.PI / 4;
    kayak.add(paddleLeft);
    
    paddleRight = createPaddle();
    paddleRight.position.set(0.4, 0.3, 0);
    paddleRight.rotation.x = Math.PI / 4;
    kayak.add(paddleRight);
    
    // Adicionar o boneco do jogador
    player = createPlayer();
    player.position.set(0, 0.4, 0);
    kayak.add(player);
    
    // Garantir que o kayak esteja reto
    kayak.rotation.set(0, 0, 0);
    
    // Adicionar caiaque à cena
    scene.add(kayak);
}

function createPaddle() {
    const paddleGroup = new THREE.Group();
    
    // Cabo do remo
    const shaftGeometry = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8);
    const shaftMaterial = new THREE.MeshPhongMaterial({
        color: 0x8B4513
    });
    
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.y = 0.6;
    paddleGroup.add(shaft);
    
    // Pá do remo
    const bladeGeometry = new THREE.BoxGeometry(0.15, 0.01, 0.4);
    const bladeMaterial = new THREE.MeshPhongMaterial({
        color: 0x1E90FF
    });
    
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.y = 1.2;
    paddleGroup.add(blade);
    
    return paddleGroup;
}

function createPlayer() {
    const playerGroup = new THREE.Group();
    
    // Cores
    const skinColor = 0xF5D0A9;
    const shirtColor = 0x3498DB;
    const pantsColor = 0x2C3E50;
    const hairColor = 0x3B240B;
    
    // Corpo (torso)
    const torsoGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.2);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: shirtColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.5;
    playerGroup.add(torso);
    
    // Cabeça
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.85;
    playerGroup.add(head);
    
    // Cabelo
    const hairGeometry = new THREE.SphereGeometry(0.16, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMaterial = new THREE.MeshPhongMaterial({ color: hairColor });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 0.88;
    hair.scale.y = 0.7;
    playerGroup.add(hair);
    
    // Pernas
    const legGeometry = new THREE.BoxGeometry(0.12, 0.3, 0.12);
    const legMaterial = new THREE.MeshPhongMaterial({ color: pantsColor });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.08, 0.15, 0);
    playerGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.08, 0.15, 0);
    playerGroup.add(rightLeg);
    
    // Braços
    const armGeometry = new THREE.BoxGeometry(0.08, 0.3, 0.08);
    const armMaterial = new THREE.MeshPhongMaterial({ color: shirtColor });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.2, 0.5, 0);
    leftArm.rotation.z = Math.PI / 6; // Inclinação para remada
    playerGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.2, 0.5, 0);
    rightArm.rotation.z = -Math.PI / 6; // Inclinação para remada
    playerGroup.add(rightArm);
    
    // Face (olhos e boca simples)
    const eyeGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.07, 0.88, 0.13);
    playerGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.07, 0.88, 0.13);
    playerGroup.add(rightEye);
    
    // Boca
    const mouthGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.01);
    const mouthMaterial = new THREE.MeshPhongMaterial({ color: 0xE74C3C });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 0.8, 0.15);
    playerGroup.add(mouth);
    
    return playerGroup;
}

function createLighthouse() {
    const lighthouseGroup = new THREE.Group();
    
    // Base circular elevada
    const baseGeometry = new THREE.CylinderGeometry(5, 6, 3, 8, 1);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x95a5a6 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 1.5;
    lighthouseGroup.add(base);
    
    // Torre principal
    const towerGeometry = new THREE.CylinderGeometry(3, 4, 15, 8, 3);
    const towerMaterial = new THREE.MeshPhongMaterial({ color: 0xf5f5f5 });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.y = 10.5;
    lighthouseGroup.add(tower);
    
    // Listras vermelhas na torre
    const stripeGeometry = new THREE.CylinderGeometry(3.01, 3.01, 3, 8, 1);
    const stripeMaterial = new THREE.MeshPhongMaterial({ color: 0xe74c3c });
    
    for (let i = 0; i < 3; i++) {
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.y = 7 + (i * 5);
        lighthouseGroup.add(stripe);
    }
    
    // Casa do faroleiro
    const houseGeometry = new THREE.BoxGeometry(6, 4, 6);
    const houseMaterial = new THREE.MeshPhongMaterial({ color: 0xd35400 });
    const house = new THREE.Mesh(houseGeometry, houseMaterial);
    house.position.set(0, 4, 5);
    lighthouseGroup.add(house);
    
    // Telhado da casa
    const roofGeometry = new THREE.ConeGeometry(4.5, 3, 4);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x7f8c8d });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, 7.5, 5);
    roof.rotation.y = Math.PI / 4;
    lighthouseGroup.add(roof);
    
    // Lanterna (topo do farol)
    const lanternGeometry = new THREE.CylinderGeometry(3.5, 3.5, 3, 8, 1);
    const lanternMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2980b9,
        transparent: true,
        opacity: 0.7
    });
    const lantern = new THREE.Mesh(lanternGeometry, lanternMaterial);
    lantern.position.y = 19.5;
    lighthouseGroup.add(lantern);
    
    // Topo do farol
    const topGeometry = new THREE.ConeGeometry(3, 2, 8);
    const topMaterial = new THREE.MeshPhongMaterial({ color: 0x34495e });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 22;
    lighthouseGroup.add(top);
    
    // Luz do farol
    const light = new THREE.PointLight(0xffffcc, 2, 100);
    light.position.set(0, 19.5, 0);
    lighthouseGroup.add(light);
    
    // Refletor direcional que gira
    const spotLight = new THREE.SpotLight(0xffffcc, 3, 200, Math.PI / 12, 0.5, 1);
    spotLight.position.set(0, 19.5, 0);
    lighthouseGroup.add(spotLight);
    spotLight.target.position.set(50, 0, 0);
    lighthouseGroup.add(spotLight.target);
    
    // Escalar para baixo o modelo do farol (era muito grande)
    lighthouseGroup.scale.set(0.2, 0.2, 0.2);
    
    return lighthouseGroup;
}

function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') keys.w = true;
        if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') keys.a = true;
        if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') keys.s = true;
        if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') keys.d = true;
        if (event.key === 'Shift') keys.shift = true;
    });
    
    document.addEventListener('keyup', (event) => {
        if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') keys.w = false;
        if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') keys.a = false;
        if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') keys.s = false;
        if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') keys.d = false;
        if (event.key === 'Shift') keys.shift = false;
    });
}

function updateKayakMovement() {
    // Calcular a altura da onda na posição atual do caiaque
    const waveHeight = getWaveHeight(kayak.position.x, kayak.position.z);
    
    // Ajustar a altura do caiaque com base nas ondas
    kayak.position.y = waveHeight + 0.2;
    
    // Calcular inclinação baseada nas ondas
    const waveGradientX = (getWaveHeight(kayak.position.x + 0.1, kayak.position.z) - waveHeight) / 0.1;
    const waveGradientZ = (getWaveHeight(kayak.position.x, kayak.position.z + 0.1) - waveHeight) / 0.1;
    
    // Ajustar rotação do caiaque com as ondas
    kayak.rotation.x = -waveGradientZ * 0.5;
    kayak.rotation.z = waveGradientX * 0.5;
    
    // Aceleração baseada em teclas
    const speedMultiplier = keys.shift ? 2.0 : 1.0;
    const acc = params.acceleration * speedMultiplier;
    
    // Movimento para frente/trás
    if (keys.w) {
        velocity.z -= Math.cos(kayak.rotation.y) * acc;
        velocity.x -= Math.sin(kayak.rotation.y) * acc;
        animatePaddling();
    } else if (keys.s) {
        velocity.z += Math.cos(kayak.rotation.y) * acc * 0.5;
        velocity.x += Math.sin(kayak.rotation.y) * acc * 0.5;
        animatePaddling();
    }
    
    // Rotação
    if (keys.a) {
        kayak.rotation.y += params.turnSpeed;
    } else if (keys.d) {
        kayak.rotation.y -= params.turnSpeed;
    }
    
    // Aplicar amortecimento
    velocity.x *= params.damping;
    velocity.z *= params.damping;
    
    // Limitar velocidade máxima
    const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (currentSpeed > params.maxSpeed) {
        velocity.x = (velocity.x / currentSpeed) * params.maxSpeed;
        velocity.z = (velocity.z / currentSpeed) * params.maxSpeed;
    }
    
    // Atualizar posição
    kayak.position.x += velocity.x;
    kayak.position.z += velocity.z;
}

function getWaveHeight(x, z, time = clock.getElapsedTime()) {
    const waveSpeed = 1.5;
    const frequency = 2.0;
    const waveHeight = 0.2;
    
    // Usar senos e cossenos para calcular a altura da onda
    const wave1 = Math.sin(x * frequency + time * waveSpeed) * waveHeight;
    const wave2 = Math.cos(z * frequency + time * waveSpeed * 0.8) * waveHeight;
    
    return wave1 + wave2;
}

function animatePaddling() {
    // Animação de remo simplificada
    const time = clock.getElapsedTime();
    const cycle = Math.sin(time * 5.0);
    const leftCycle = cycle;
    const rightCycle = -cycle;
    
    if (keys.w || keys.s) {
        // Movimento de remada
        paddleLeft.rotation.x = Math.PI / 4 + leftCycle * 0.3;
        paddleLeft.rotation.z = leftCycle * 0.2;
        paddleRight.rotation.x = Math.PI / 4 + rightCycle * 0.3;
        paddleRight.rotation.z = rightCycle * 0.2;
        
        // Animar braços do jogador
        if (player) {
            player.children[5].rotation.z = Math.PI / 6 + leftCycle * 0.3; // Braço esquerdo
            player.children[6].rotation.z = -Math.PI / 6 + rightCycle * 0.3; // Braço direito
        }
    } else {
        // Posição de descanso
        paddleLeft.rotation.x = Math.PI / 4;
        paddleLeft.rotation.z = 0;
        paddleRight.rotation.x = Math.PI / 4;
        paddleRight.rotation.z = 0;
        
        // Posição de descanso para os braços
        if (player) {
            player.children[5].rotation.z = Math.PI / 6; // Braço esquerdo
            player.children[6].rotation.z = -Math.PI / 6; // Braço direito
        }
    }
}

function updateCamera() {
    // Posicionar a câmera atrás e acima do caiaque
    const offset = new THREE.Vector3(0, 2, 5);
    
    // Rotacionar o offset baseado na rotação do caiaque
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), kayak.rotation.y);
    
    // Posição alvo da câmera
    const targetPosition = new THREE.Vector3().copy(kayak.position).add(offset);
    
    // Suavizar o movimento da câmera
    camera.position.lerp(targetPosition, 0.05);
    
    // Fazer a câmera olhar para o caiaque
    camera.lookAt(
        kayak.position.x,
        kayak.position.y + 0.5,
        kayak.position.z
    );
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Atualizar tempo para ondas
    if (ocean && ocean.material.uniforms) {
        ocean.material.uniforms.uTime.value = clock.getElapsedTime();
    }
    
    // Atualizar controles
    controls.update();
    
    // Atualizar movimento do caiaque
    updateKayakMovement();
    
    // Atualizar câmera
    updateCamera();
    
    // Atualizar o farol
    updateLighthouse();
    
    // Render
    renderer.render(scene, camera);
}

function updateLighthouse() {
    if (lighthouse) {
        // Girar o feixe de luz
        const time = clock.getElapsedTime();
        const spotLight = lighthouse.children[9]; // O spotlight é o décimo elemento no grupo
        const target = lighthouse.children[10]; // O target é o décimo primeiro
        
        // Girar em torno do farol
        const angle = time * 0.5;
        const radius = 50;
        target.position.x = Math.cos(angle) * radius;
        target.position.z = Math.sin(angle) * radius;
        
        // Piscar a luz suavemente
        const pulseIntensity = 2 + Math.sin(time * 2) * 0.5;
        spotLight.intensity = pulseIntensity;
    }
} 