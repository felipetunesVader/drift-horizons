import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Variáveis globais
let scene, camera, renderer, controls;
let ocean, skybox;
let kayak, paddleLeft, paddleRight;
let clock = new THREE.Clock();
let velocity = new THREE.Vector3();
let waveUniforms = { uTime: { value: 0 } };
let isAudioPlaying = false;
let terrain = [];
let textureLoader = new THREE.TextureLoader();
let worldSize = 200;
let chunkSize = 50;
let chunksVisible = 5;
let worldSeed = Math.random() * 10000;
let cubeMapUrls = [
    'https://threejs.org/examples/textures/cube/skybox/px.jpg', // right
    'https://threejs.org/examples/textures/cube/skybox/nx.jpg', // left
    'https://threejs.org/examples/textures/cube/skybox/py.jpg', // top
    'https://threejs.org/examples/textures/cube/skybox/ny.jpg', // bottom
    'https://threejs.org/examples/textures/cube/skybox/pz.jpg', // front
    'https://threejs.org/examples/textures/cube/skybox/nz.jpg'  // back
];

// Controles do jogador
const keys = { w: false, a: false, s: false, d: false, shift: false };
const params = {
    acceleration: 0.0005,
    damping: 0.98,
    turnSpeed: 0.02,
    maxSpeed: 0.05,
    waveHeight: 0.2,
    waveFrequency: 2.0,
    waveSpeed: 2.0,
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
    camera.position.set(0, 5, 10);
    
    // Configurar renderizador com melhorias
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        logarithmicDepthBuffer: true,
        precision: 'highp'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    
    // Adicionar controles para depuração
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    
    // Luzes com melhorias
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, -20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);
    
    // Carregar texturas e recursos
    const textures = loadTextures();
    
    // Criar elementos do jogo com as novas texturas
    createSkybox();
    createOcean(textures);
    createKayak();
    
    // Gerar mundo procedural
    generateProceduralWorld(textures);
    
    // Capturar entrada do teclado
    setupKeyboardControls();
    
    // Redimensionar
    window.addEventListener('resize', onWindowResize);
    
    // Esconder a tela de carregamento manualmente
    document.getElementById('loading').style.display = 'none';
    
    // Iniciar animação
    animate();
}

function createSkybox() {
    // Criar uma esfera grande para o skybox com gradiente
    const geometry = new THREE.SphereGeometry(500, 32, 32);
    geometry.scale(-1, 1, 1); // Virar a esfera ao contrário
    
    // Shader para criar um gradiente de céu
    const vertexShader = `
        varying vec3 vWorldPosition;
        
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    
    const fragmentShader = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        
        varying vec3 vWorldPosition;
        
        void main() {
            float h = normalize(vWorldPosition).y;
            float t = max(0.0, min(1.0, (h + 1.0) / 2.0));
            gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
    `;
    
    const uniforms = {
        topColor: { value: new THREE.Color(0x001133) },
        bottomColor: { value: new THREE.Color(0x001e3c) }
    };
    
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.BackSide
    });
    
    skybox = new THREE.Mesh(geometry, material);
    scene.add(skybox);
}

function createOcean(textures) {
    // Criar geometria do oceano (maior para mundo procedural)
    const geometry = new THREE.PlaneGeometry(worldSize, worldSize, 200, 200);
    
    // Shader mais avançado para animação das ondas com reflexos
    const vertexShader = `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        varying float vDepth;
        
        void main() {
            vUv = uv;
            vPosition = position;
            vNormal = normalize(normal);
            
            float waveHeight = 0.2;
            float waveSpeed = 1.5;
            float frequency = 2.0;
            
            // Ondas principais
            float wave1 = sin(position.x * frequency + uTime * waveSpeed) * waveHeight;
            float wave2 = cos(position.y * frequency + uTime * waveSpeed * 0.8) * waveHeight;
            
            // Ondas secundárias para mais detalhes
            float wave3 = sin(position.x * frequency * 2.0 + uTime * waveSpeed * 1.3) * waveHeight * 0.3;
            float wave4 = cos(position.y * frequency * 2.5 + uTime * waveSpeed) * waveHeight * 0.2;
            
            // Ondas terciárias para detalhes finos
            float wave5 = sin(position.x * frequency * 5.0 + uTime * waveSpeed * 0.7) * waveHeight * 0.1;
            float wave6 = cos(position.y * frequency * 4.0 + uTime * waveSpeed * 1.1) * waveHeight * 0.15;
            
            // Combinar ondas
            float totalWave = wave1 + wave2 + wave3 + wave4 + wave5 + wave6;
            
            // Aplicar deslocamento
            vec3 newPosition = position;
            newPosition.z += totalWave;
            
            // Calcular posição no espaço de mundo
            vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
            vWorldPosition = worldPosition.xyz;
            
            // Calcular direção de visualização
            vViewDirection = normalize(cameraPosition - worldPosition.xyz);
            
            // Calcular profundidade para transparência
            vDepth = clamp(length(worldPosition.xyz - cameraPosition) / 100.0, 0.0, 1.0);
            
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `;
    
    const fragmentShader = `
        uniform float uTime;
        uniform samplerCube envMap;
        uniform sampler2D normalMap;
        uniform sampler2D detailMap;
        uniform sampler2D causticsMap;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        uniform vec3 skyColor;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        varying float vDepth;
        
        // Funções auxiliares
        float fresnel(vec3 viewDirection, vec3 normal) {
            return pow(1.0 - max(0.0, dot(viewDirection, normal)), 4.0);
        }
        
        void main() {
            // Shift UVs com base no tempo para efeito de movimento
            vec2 uvTimeShift1 = vUv + vec2(-0.02, 0.03) * uTime * 0.2;
            vec2 uvTimeShift2 = vUv + vec2(0.04, -0.01) * uTime * 0.3;
            
            // Aplicar normal maps para detalhes
            vec3 normalFromMap1 = texture2D(normalMap, uvTimeShift1).rgb * 2.0 - 1.0;
            vec3 normalFromMap2 = texture2D(detailMap, uvTimeShift2).rgb * 2.0 - 1.0;
            
            // Combinar normal maps com diferentes intensidades
            vec3 combinedNormal = normalize(normalFromMap1 * 0.5 + normalFromMap2 * 0.3);
            
            // Combinar com a normal base da geometria
            vec3 normal = normalize(vNormal + combinedNormal * 0.4);
            
            // Efeito Fresnel - aumenta reflexões em ângulos rasos
            float fresnelTerm = fresnel(vViewDirection, normal);
            
            // Calcular direção de reflexão
            vec3 reflectedDir = reflect(-vViewDirection, normal);
            
            // Amostra do mapa de ambiente para reflexões
            vec3 reflectedColor = textureCube(envMap, reflectedDir).rgb;
            
            // Ajustar cor de profundidade
            vec3 baseWaterColor = mix(waterColor, deepWaterColor, vDepth);
            
            // Efeito caustics (padrões de luz subaquática)
            vec2 causticsUV = vWorldPosition.xz * 0.05 + uTime * 0.05;
            vec3 caustics = texture2D(causticsMap, causticsUV).rgb * 0.3;
            
            // Aplicar caustics apenas em áreas mais rasas
            caustics *= (1.0 - vDepth) * 0.5;
            
            // Especular do sol
            float sunSpec = pow(max(0.0, dot(reflectedDir, normalize(sunDirection))), 256.0) * 0.8;
            vec3 sunSpecular = sunColor * sunSpec;
            
            // Combinar cores finais
            vec3 finalColor = mix(baseWaterColor, reflectedColor, fresnelTerm * 0.7);
            
            // Adicionar efeitos extra
            finalColor += sunSpecular;
            finalColor += caustics;
            
            // Ajustar saturação baseada na profundidade
            finalColor = mix(finalColor, vec3(length(finalColor) * 0.33), vDepth * 0.2);
            
            // Transparência variável baseada na profundidade
            float alpha = mix(0.7, 0.95, vDepth);
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;
    
    const material = new THREE.ShaderMaterial({
        uniforms: { 
            uTime: { value: 0.0 },
            envMap: { value: textures.envMap },
            normalMap: { value: textures.waterNormal },
            detailMap: { value: textures.waterDetail },
            causticsMap: { value: textures.caustics },
            sunColor: { value: new THREE.Color(1.0, 0.95, 0.8) },
            sunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
            waterColor: { value: new THREE.Color(0.0, 0.35, 0.5) },
            deepWaterColor: { value: new THREE.Color(0.0, 0.15, 0.35) },
            skyColor: { value: new THREE.Color(0.0, 0.1, 0.3) }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2;
    ocean.receiveShadow = true;
    scene.add(ocean);
    
    console.log("Oceano realista criado com reflexos, normal maps e transparência");
}

function createKayak() {
    // Criar grupo para o caiaque
    kayak = new THREE.Group();
    
    // Corpo do caiaque (mais realista)
    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.3, 2.5);
    bodyGeometry.scale(1, 0.5, 1); // Achatado para parecer mais com um caiaque
    
    // Material com textura para o caiaque
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xf57c36, // Laranja
        roughness: 0.6,
        metalness: 0.1
    });
    
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.1; // Altura do caiaque acima da água
    kayak.add(body);
    
    // Criar o remador (pessoa simples)
    const paddlerGroup = new THREE.Group();
    paddlerGroup.position.set(0, 0.3, -0.2);
    kayak.add(paddlerGroup);
    
    // Criar pessoa estilizada
    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.3);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 }); // Cor da roupa
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.3;
    paddlerGroup.add(torso);
    
    // Cabeça
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xe0ac69 }); // Cor da pele
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.6;
    paddlerGroup.add(head);
    
    // Braços
    const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.rotation.z = Math.PI / 3;
    leftArm.position.set(-0.3, 0.3, 0);
    paddlerGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.rotation.z = -Math.PI / 3;
    rightArm.position.set(0.3, 0.3, 0);
    paddlerGroup.add(rightArm);
    
    // Remos
    const paddleGeometry = new THREE.BoxGeometry(0.1, 0.01, 1.2);
    const bladeGeometry = new THREE.BoxGeometry(0.2, 0.01, 0.3);
    const paddleMaterial = new THREE.MeshStandardMaterial({ color: 0x5d4037 }); // Marrom
    
    // Remo esquerdo
    paddleLeft = new THREE.Group();
    const paddleLeftHandle = new THREE.Mesh(paddleGeometry, paddleMaterial);
    const paddleLeftBlade = new THREE.Mesh(bladeGeometry, paddleMaterial);
    paddleLeftBlade.position.z = 0.6;
    paddleLeft.add(paddleLeftHandle);
    paddleLeft.add(paddleLeftBlade);
    paddleLeft.position.set(-0.6, 0.3, 0);
    paddleLeft.rotation.x = Math.PI / 4;
    paddlerGroup.add(paddleLeft);
    
    // Remo direito
    paddleRight = new THREE.Group();
    const paddleRightHandle = new THREE.Mesh(paddleGeometry, paddleMaterial);
    const paddleRightBlade = new THREE.Mesh(bladeGeometry, paddleMaterial);
    paddleRightBlade.position.z = 0.6;
    paddleRight.add(paddleRightHandle);
    paddleRight.add(paddleRightBlade);
    paddleRight.position.set(0.6, 0.3, 0);
    paddleRight.rotation.x = Math.PI / 4;
    paddlerGroup.add(paddleRight);
    
    // Configurações iniciais do caiaque
    kayak.position.y = 0; // Será ajustado pela altura das ondas
    scene.add(kayak);
}

function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() in keys) {
            keys[e.key.toLowerCase()] = true;
        }
        if (e.key === 'Shift') {
            keys.shift = true;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() in keys) {
            keys[e.key.toLowerCase()] = false;
        }
        if (e.key === 'Shift') {
            keys.shift = false;
        }
    });
}

function updateKayakMovement() {
    // Calcular aceleração com base no boost de Shift
    const currentAcceleration = params.acceleration * (keys.shift ? 2.5 : 1.0);
    const currentMaxSpeed = params.maxSpeed * (keys.shift ? 1.5 : 1.0);
    
    // Controle direcional
    if (keys.w) {
        velocity.z -= Math.cos(kayak.rotation.y) * currentAcceleration;
        velocity.x -= Math.sin(kayak.rotation.y) * currentAcceleration;
    }
    if (keys.s) {
        velocity.z += Math.cos(kayak.rotation.y) * currentAcceleration * 0.5; // Mover para trás é mais lento
        velocity.x += Math.sin(kayak.rotation.y) * currentAcceleration * 0.5;
    }
    if (keys.a) {
        kayak.rotation.y += params.turnSpeed;
    }
    if (keys.d) {
        kayak.rotation.y -= params.turnSpeed;
    }
    
    // Limitar velocidade máxima
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed > currentMaxSpeed) {
        velocity.x = (velocity.x / speed) * currentMaxSpeed;
        velocity.z = (velocity.z / speed) * currentMaxSpeed;
    }
    
    // Aplicar amortecimento
    velocity.multiplyScalar(params.damping);
    
    // Atualizar posição
    kayak.position.x += velocity.x;
    kayak.position.z += velocity.z;
    
    // Animar remos quando se movendo
    animatePaddles(speed);
    
    // Obter altura da onda na posição do caiaque
    kayak.position.y = getWaveHeight(kayak.position.x, kayak.position.z) + 0.1;
    
    // Inclinar o caiaque baseado nas ondas
    const frontPos = new THREE.Vector3(
        kayak.position.x + Math.sin(kayak.rotation.y),
        0,
        kayak.position.z + Math.cos(kayak.rotation.y)
    );
    const backPos = new THREE.Vector3(
        kayak.position.x - Math.sin(kayak.rotation.y),
        0,
        kayak.position.z - Math.cos(kayak.rotation.y)
    );
    
    const frontHeight = getWaveHeight(frontPos.x, frontPos.z);
    const backHeight = getWaveHeight(backPos.x, backPos.z);
    
    // Inclinação frente/trás (pitch)
    kayak.rotation.x = Math.atan2(frontHeight - backHeight, 2.0) * 0.5;
    
    // Inclinação laterais (roll)
    const rightPos = new THREE.Vector3(
        kayak.position.x + Math.cos(kayak.rotation.y),
        0,
        kayak.position.z - Math.sin(kayak.rotation.y)
    );
    const leftPos = new THREE.Vector3(
        kayak.position.x - Math.cos(kayak.rotation.y),
        0,
        kayak.position.z + Math.sin(kayak.rotation.y)
    );
    
    const rightHeight = getWaveHeight(rightPos.x, rightPos.z);
    const leftHeight = getWaveHeight(leftPos.x, leftPos.z);
    
    kayak.rotation.z = Math.atan2(rightHeight - leftHeight, 1.0) * 0.5;
}

function getWaveHeight(x, z) {
    const time = clock.getElapsedTime() * params.waveSpeed;
    const height = params.waveHeight;
    const freq = params.waveFrequency;
    
    // Usar a mesma fórmula do shader para consistência
    let wave1 = Math.sin(x * freq + time) * height;
    let wave2 = Math.cos(z * freq + time) * height;
    
    return wave1 + wave2;
}

function animatePaddles(speed) {
    if (!paddleLeft || !paddleRight) return;
    
    const time = clock.getElapsedTime();
    
    // Se estiver se movendo, animar os remos
    if (speed > 0.005) {
        // Alternar entre os remos
        const paddlingRate = 3.0 + speed * 20; // Remadas mais rápidas com velocidade maior
        
        // Ciclo de remada
        const leftCycle = Math.sin(time * paddlingRate);
        const rightCycle = Math.sin(time * paddlingRate + Math.PI); // Defasado
        
        // Animação do remo esquerdo
        paddleLeft.rotation.x = Math.PI / 4 + leftCycle * 0.5;
        paddleLeft.rotation.z = leftCycle * 0.2;
        
        // Animação do remo direito
        paddleRight.rotation.x = Math.PI / 4 + rightCycle * 0.5;
        paddleRight.rotation.z = rightCycle * 0.2;
        
    } else {
        // Posição de descanso
        paddleLeft.rotation.x = Math.PI / 4;
        paddleLeft.rotation.z = 0;
        paddleRight.rotation.x = Math.PI / 4;
        paddleRight.rotation.z = 0;
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
        kayak.position.y + 0.5, // Olhar um pouco acima do caiaque
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
    
    const time = clock.getElapsedTime();
    
    // Atualizar o tempo para o shader do oceano com efeitos dinâmicos
    if (ocean && ocean.material.uniforms) {
        ocean.material.uniforms.uTime.value = time;
        
        // Atualizar direção do sol se houver ciclo dia/noite
        // ocean.material.uniforms.sunDirection.value.set(
        //    Math.sin(time * 0.05), 
        //    Math.max(0.1, Math.sin(time * 0.05)), 
        //    Math.cos(time * 0.05)
        // ).normalize();
    }
    
    // Atualizar controles
    controls.update();
    
    // Atualizar movimento do caiaque
    updateKayakMovement();
    
    // Atualizar câmera
    updateCamera();
    
    // Atualizar mundo procedural quando necessário
    if (Math.floor(time) % 2 === 0 && !window.lastWorldUpdate) {
        updateVisibleChunks(loadTextures());
        window.lastWorldUpdate = true;
    } else if (Math.floor(time) % 2 === 1) {
        window.lastWorldUpdate = false;
    }
    
    // Animação das plantas subaquáticas
    animateSeaPlants();
    
    // Render
    renderer.render(scene, camera);
}

// Animar plantas subaquáticas
function animateSeaPlants() {
    const time = clock.getElapsedTime();
    
    for (let i = 0; i < terrain.length; i++) {
        const chunk = terrain[i];
        chunk.traverse(child => {
            if (child.userData && child.userData.type === 'seaplant') {
                // Movimento de ondulação suave
                child.rotation.y = Math.sin(time * 0.5 + child.position.x) * 0.1;
                
                // Atualizar altura com as ondas
                const waveHeight = getWaveHeight(child.position.x, child.position.z, time);
                child.position.y = -1 + waveHeight;
            }
        });
    }
}

// Carregar texturas necessárias logo após a inicialização
function loadTextures() {
    // Criar carregador de cubemap para reflexos
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    const environmentMap = cubeTextureLoader.load(cubeMapUrls);
    environmentMap.encoding = THREE.sRGBEncoding;
    
    return {
        waterNormal: textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(8, 8); // Repetir mais vezes para detalhes menores
        }),
        waterDetail: textureLoader.load('https://threejs.org/examples/textures/Water_1_M_Normal.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(16, 16); // Repetição alta para detalhes minúsculos
        }),
        caustics: textureLoader.load('https://threejs.org/examples/textures/caustics.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(8, 8);
        }),
        envMap: environmentMap,
        sand: textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5);
        }),
        rock: textureLoader.load('https://threejs.org/examples/textures/terrain/backgrounddetailed6.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(10, 10);
        }),
        coral: textureLoader.load('https://threejs.org/examples/textures/Water_1_M_Normal.jpg', texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        })
    };
}

// Adicionar função para gerar mundo procedural
function generateProceduralWorld(textures) {
    // Limpar mundo existente
    for (let i = 0; i < terrain.length; i++) {
        scene.remove(terrain[i]);
    }
    terrain = [];
    
    // Determinar quais chunks devem ser criados baseado na posição do jogador
    updateVisibleChunks(textures);
}

// Função para gerenciar chunks visíveis baseado na posição do jogador
function updateVisibleChunks(textures) {
    if (!kayak) return;
    
    // Calcular posição do chunk atual do jogador
    const chunkX = Math.floor(kayak.position.x / chunkSize);
    const chunkZ = Math.floor(kayak.position.z / chunkSize);
    
    // Gerar chunks em um raio ao redor do jogador
    const radius = Math.floor(chunksVisible / 2);
    
    for (let x = chunkX - radius; x <= chunkX + radius; x++) {
        for (let z = chunkZ - radius; z <= chunkZ + radius; z++) {
            const chunkKey = `${x},${z}`;
            
            // Verificar se o chunk já existe
            const exists = terrain.some(obj => obj.userData.chunkKey === chunkKey);
            
            if (!exists) {
                // Criar novo chunk
                createTerrainChunk(x, z, textures);
            }
        }
    }
    
    // Remover chunks fora de alcance
    for (let i = terrain.length - 1; i >= 0; i--) {
        const chunk = terrain[i];
        const [chunkObjX, chunkObjZ] = chunk.userData.chunkKey.split(',').map(Number);
        
        if (Math.abs(chunkObjX - chunkX) > radius + 1 || 
            Math.abs(chunkObjZ - chunkZ) > radius + 1) {
            scene.remove(chunk);
            terrain.splice(i, 1);
        }
    }
}

// Criar um chunk de terreno com elementos procedurais
function createTerrainChunk(chunkX, chunkZ, textures) {
    const chunkGroup = new THREE.Group();
    chunkGroup.userData.chunkKey = `${chunkX},${chunkZ}`;
    
    const chunkCenterX = chunkX * chunkSize + chunkSize / 2;
    const chunkCenterZ = chunkZ * chunkSize + chunkSize / 2;
    
    // Usar deterministic noise baseado na posição do chunk e seed
    const noiseSeed = worldSeed + chunkX * 1000 + chunkZ;
    const random = seededRandom(noiseSeed);
    
    // Decidir se este chunk tem uma ilha
    if (random() < 0.2) { // 20% de chance de ter uma ilha
        createIsland(chunkGroup, chunkCenterX, chunkCenterZ, random, textures);
    }
    
    // Adicionar algumas plantas/corais subaquáticos
    const plantCount = Math.floor(random() * 10);
    for (let i = 0; i < plantCount; i++) {
        const plantX = chunkCenterX + (random() - 0.5) * chunkSize * 0.8;
        const plantZ = chunkCenterZ + (random() - 0.5) * chunkSize * 0.8;
        createSeaPlant(chunkGroup, plantX, plantZ, textures, random);
    }
    
    scene.add(chunkGroup);
    terrain.push(chunkGroup);
}

// Criar uma ilha em um chunk
function createIsland(parent, x, z, random, textures) {
    // Tamanho da ilha
    const islandSize = 3 + random() * 8;
    const islandHeight = 1 + random() * 3;
    
    // Criar geometria da ilha
    const islandGeometry = new THREE.CylinderGeometry(islandSize, islandSize * 1.2, islandHeight, 16, 3);
    
    // Deformar a geometria para parecer mais natural
    const vertices = islandGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);
        
        // Aplicar ruído para criar terreno irregular
        const distFromCenter = Math.sqrt(x * x + z * z);
        const noise = simplex(x * 0.2, z * 0.2) * 0.5;
        
        // Deformar mais nas bordas
        const deform = noise * (distFromCenter / islandSize);
        
        vertices.setX(i, x + x * deform * 0.3);
        vertices.setZ(i, z + z * deform * 0.3);
        
        // Adicionar mais altura nas partes centrais
        if (y > 0 && distFromCenter < islandSize * 0.7) {
            vertices.setY(i, y + noise * 0.5);
        }
    }
    
    // Recalcular normais após deformação
    islandGeometry.computeVertexNormals();
    
    // Material para a ilha
    const islandMaterial = new THREE.MeshStandardMaterial({
        map: textures.sand,
        roughness: 0.8,
        metalness: 0.1,
        flatShading: true
    });
    
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.position.set(x, 0, z);
    island.rotation.y = random() * Math.PI * 2;
    
    // Adicionar algumas rochas na ilha
    const rockCount = Math.floor(random() * 5) + 1;
    for (let i = 0; i < rockCount; i++) {
        createRock(island, random() * islandSize * 0.7, islandHeight / 2, random() * islandSize * 0.7, textures, random);
    }
    
    // Adicionar algumas palmeiras
    const palmCount = Math.floor(random() * 3) + 1;
    for (let i = 0; i < palmCount; i++) {
        const palmX = (random() - 0.5) * islandSize * 0.8;
        const palmZ = (random() - 0.5) * islandSize * 0.8;
        const distFromCenter = Math.sqrt(palmX * palmX + palmZ * palmZ);
        
        // Colocar palmeiras mais próximas das bordas
        if (distFromCenter > islandSize * 0.3) {
            createPalmTree(island, palmX, islandHeight / 2, palmZ, textures, random);
        }
    }
    
    parent.add(island);
}

// Criar rocha
function createRock(parent, x, y, z, textures, random) {
    const rockGeometry = new THREE.DodecahedronGeometry(0.5 + random() * 0.5, 1);
    
    // Deformar a geometria para parecer mais natural
    const vertices = rockGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
        const vx = vertices.getX(i);
        const vy = vertices.getY(i);
        const vz = vertices.getZ(i);
        
        const noise = random() * 0.2;
        vertices.setX(i, vx * (1 + noise));
        vertices.setY(i, vy * (1 + noise));
        vertices.setZ(i, vz * (1 + noise));
    }
    
    rockGeometry.computeVertexNormals();
    
    const rockMaterial = new THREE.MeshStandardMaterial({
        map: textures.rock,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });
    
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, y, z);
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    rock.scale.set(
        0.7 + random() * 0.6,
        0.7 + random() * 0.6,
        0.7 + random() * 0.6
    );
    
    parent.add(rock);
    return rock;
}

// Criar palmeira
function createPalmTree(parent, x, y, z, textures, random) {
    const palmGroup = new THREE.Group();
    
    // Tronco da palmeira
    const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2 + random() * 1.5, 8, 4);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.9,
        metalness: 0.1
    });
    
    // Curvar o tronco
    const vertices = trunkGeometry.attributes.position;
    const bend = (random() * 0.2) + 0.1;
    const bendDir = random() * Math.PI * 2;
    
    for (let i = 0; i < vertices.count; i++) {
        const vy = vertices.getY(i);
        const t = (vy + trunkGeometry.parameters.height * 0.5) / trunkGeometry.parameters.height;
        
        if (t > 0.5) {
            const bendAmount = (t - 0.5) * 2 * bend;
            vertices.setX(i, vertices.getX(i) + Math.cos(bendDir) * bendAmount);
            vertices.setZ(i, vertices.getZ(i) + Math.sin(bendDir) * bendAmount);
        }
    }
    
    trunkGeometry.computeVertexNormals();
    
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = trunkGeometry.parameters.height * 0.5;
    palmGroup.add(trunk);
    
    // Folhas da palmeira
    const leafCount = 5 + Math.floor(random() * 3);
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x2E8B57,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    for (let i = 0; i < leafCount; i++) {
        const leafLength = 1 + random() * 0.5;
        const leafWidth = 0.2 + random() * 0.2;
        
        // Criar forma da folha
        const leafShape = new THREE.Shape();
        leafShape.moveTo(0, 0);
        leafShape.lineTo(leafLength * 0.2, leafWidth * 0.5);
        leafShape.lineTo(leafLength, 0);
        leafShape.lineTo(leafLength * 0.2, -leafWidth * 0.5);
        leafShape.lineTo(0, 0);
        
        const leafGeometry = new THREE.ShapeGeometry(leafShape, 6);
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        
        // Posicionar no topo do tronco
        leaf.position.y = trunkGeometry.parameters.height;
        
        // Rotacionar aleatoriamente
        const angle = (i / leafCount) * Math.PI * 2;
        leaf.rotation.z = -Math.PI / 4 - random() * Math.PI / 4;
        leaf.rotation.y = angle;
        
        palmGroup.add(leaf);
    }
    
    palmGroup.position.set(x, y, z);
    parent.add(palmGroup);
    return palmGroup;
}

// Criar planta subaquática
function createSeaPlant(parent, x, z, textures, random) {
    const plantHeight = 0.5 + random() * 1;
    const plantWidth = 0.3 + random() * 0.3;
    
    const plantGeometry = new THREE.CylinderGeometry(0, plantWidth, plantHeight, 8, 4, true);
    
    // Deformar para parecer mais orgânico
    const vertices = plantGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
        const vx = vertices.getX(i);
        const vy = vertices.getY(i);
        const vz = vertices.getZ(i);
        
        const waveFactor = 0.2 * Math.sin(vy * 10);
        vertices.setX(i, vx + waveFactor);
        vertices.setZ(i, vz + waveFactor);
    }
    
    plantGeometry.computeVertexNormals();
    
    const plantMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(
            0.1 + random() * 0.1,
            0.5 + random() * 0.3,
            0.3 + random() * 0.2
        ),
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    
    const plant = new THREE.Mesh(plantGeometry, plantMaterial);
    
    // Posicionar a planta no fundo do oceano
    const time = clock.getElapsedTime();
    const waveHeight = getWaveHeight(x, z, time);
    plant.position.set(x, -1 + waveHeight, z);
    plant.rotation.y = random() * Math.PI * 2;
    
    parent.add(plant);
    return plant;
}

// Funções auxiliares para geração procedural

// Função de ruído para terreno
function simplex(x, z) {
    // Implementação simples de ruído pseudo-aleatório
    return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0;
}

// Função de aleatoriedade com seed para determinismo
function seededRandom(seed) {
    let value = seed;
    return function() {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
} 