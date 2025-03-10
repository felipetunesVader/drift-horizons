// Usar o Three.js global
const THREE = window.THREE;

// Configuração inicial
let scene, camera, renderer, player, ocean;

// Sistema de controle
const keys = { w: false, a: false, s: false, d: false };

// Adicionar estas variáveis no início do arquivo
let islands = [];
let collectibles = 0;
let score = 0;

// Adicionar após as variáveis iniciais
let clock = new THREE.Clock();
let shark = null;
let aurora = null;
let isNight = false;
let textureLoader = new THREE.TextureLoader();

// Carregar texturas
const textures = {
    water: textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg'),
    island: textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg'),
    wood: textureLoader.load('https://threejs.org/examples/textures/hardwood2_diffuse.jpg')
};

// Configurar texturas
textures.water.wrapS = textures.water.wrapT = THREE.RepeatWrapping;
textures.water.repeat.set(10, 10);
textures.island.wrapS = textures.island.wrapT = THREE.RepeatWrapping;
textures.island.repeat.set(3, 3);
textures.wood.wrapS = textures.wood.wrapT = THREE.RepeatWrapping;
textures.wood.repeat.set(1, 1);

// Iniciar diretamente sem carregar scripts adicionais
init();

function init() {
    console.log("Iniciando...");
    
    // Configuração da cena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Céu azul simples
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    
    // Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(100, 100, 50);
    scene.add(directionalLight);
    
    // Criar elementos básicos
    ocean = createOcean();
    createPlayer();
    createIslands();
    createScoreDisplay();
    
    // Adicionar céu, sol e lua
    sky = createSky();
    sun = createSun();
    moon = createMoon();
    
    // Configurar controles
    document.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
    
    // Posição inicial da câmera
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    
    // Iniciar ciclo dia/noite
    updateDayNightCycle();
    
    console.log("Iniciando animação...");
    // Iniciar loop de animação
    animate();
}

function createOcean() {
    const geometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    
    // Carregar texturas alternativas que existem
    const normalMap = textureLoader.load('https://threejs.org/examples/textures/water/Water_1_M_Normal.jpg');
    // Usar texturas alternativas para as que não foram encontradas
    const dudvMap = textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg');
    const foamTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;
    foamTexture.wrapS = foamTexture.wrapT = THREE.RepeatWrapping;
    
    // Criar shader personalizado para água realista
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            normalMap: { value: normalMap },
            dudvMap: { value: dudvMap },
            foamTexture: { value: foamTexture },
            waterColor: { value: new THREE.Color(0x004080) },
            deepWaterColor: { value: new THREE.Color(0x001030) },
            sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0) },
            sunColor: { value: new THREE.Color(1.0, 1.0, 0.8) },
            cameraPosCustom: { value: new THREE.Vector3() }
        },
        vertexShader: `
            uniform float time;
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            varying vec4 vProjectedPosition;
            
            void main() {
                vUv = uv;
                vPosition = position;
                vNormal = normal;
                
                // Criar ondas mais suaves e menos agitadas
                float wave1 = sin(position.x * 0.01 + time * 0.2) * 
                             cos(position.z * 0.01 + time * 0.15) * 0.5;
                float wave2 = sin(position.x * 0.02 + time * 0.15) * 0.3;
                float wave3 = cos(position.z * 0.02 + time * 0.2) * 0.3;
                float wave4 = sin(position.x * 0.05 + position.z * 0.05 + time * 0.25) * 0.15;
                
                vec3 pos = position;
                pos.y += wave1 + wave2 + wave3 + wave4;
                
                // Calcular normal baseada nas ondas
                vec3 tangent = normalize(vec3(1.0, 
                    cos(position.x * 0.01 + time * 0.2) * 0.01 +
                    cos(position.x * 0.02 + time * 0.15) * 0.012 +
                    sin(position.x * 0.05 + position.z * 0.05 + time * 0.25) * 0.015,
                    0.0));
                vec3 bitangent = normalize(vec3(0.0, 
                    sin(position.z * 0.01 + time * 0.15) * 0.01 +
                    sin(position.z * 0.02 + time * 0.2) * 0.012 +
                    cos(position.x * 0.05 + position.z * 0.05 + time * 0.25) * 0.015,
                    1.0));
                vNormal = normalize(cross(tangent, bitangent));
                
                vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
                vProjectedPosition = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                gl_Position = vProjectedPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 waterColor;
            uniform vec3 deepWaterColor;
            uniform sampler2D normalMap;
            uniform sampler2D dudvMap;
            uniform sampler2D foamTexture;
            uniform float time;
            uniform vec3 sunDirection;
            uniform vec3 sunColor;
            uniform vec3 cameraPosCustom;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            varying vec4 vProjectedPosition;
            
            const float shininess = 100.0;
            const float fresnelPower = 2.0;
            
            void main() {
                // Movimento da textura mais suave
                vec2 distortedUv = vUv * 8.0;
                vec2 distortion1 = (texture2D(dudvMap, vec2(distortedUv.x + time * 0.02, distortedUv.y + time * 0.02)).rg * 2.0 - 1.0) * 0.01;
                vec2 distortion2 = (texture2D(dudvMap, vec2(-distortedUv.x + time * 0.03, distortedUv.y + time * 0.01)).rg * 2.0 - 1.0) * 0.01;
                
                vec2 totalDistortion = distortion1 + distortion2;
                
                // Normal map com distorção
                vec2 normalUv = vUv * 4.0 + totalDistortion;
                vec3 normal = texture2D(normalMap, normalUv).rgb * 2.0 - 1.0;
                normal = normalize(normal);
                
                // Direção da luz refletida
                vec3 viewDirection = normalize(cameraPosCustom - vWorldPosition);
                vec3 lightReflectDirection = reflect(-sunDirection, normal);
                
                // Especular
                float specular = pow(max(dot(viewDirection, lightReflectDirection), 0.0), shininess);
                
                // Fresnel (reflexão mais forte em ângulos rasos)
                float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), fresnelPower);
                
                // Profundidade simulada
                float depth = clamp(vPosition.y * 0.5 + 0.5, 0.0, 1.0);
                
                // Caustics (efeito de luz subaquática) mais sutil
                float caustics = texture2D(dudvMap, vUv * 5.0 + time * 0.02).r * 0.5 + 0.5;
                caustics *= texture2D(dudvMap, vUv * 4.0 - time * 0.02).g * 0.5 + 0.5;
                caustics = pow(caustics, 2.0) * 1.5;
                
                // Espuma nas cristas das ondas (menos proeminente)
                float foam = texture2D(foamTexture, vUv * 6.0 + totalDistortion + vec2(time * 0.02, time * 0.01)).r;
                float waveHeight = clamp(vPosition.y * 2.0, 0.0, 1.0);
                foam *= smoothstep(0.7, 1.0, waveHeight) * 0.7; // Menos espuma
                
                // Cor final
                vec3 color = mix(deepWaterColor, waterColor, depth);
                color += specular * sunColor * 0.4;
                color = mix(color, vec3(1.0), foam * 0.3); // Espuma menos intensa
                color = mix(color, vec3(1.0, 1.0, 1.0), fresnel * 0.4);
                color += caustics * sunColor * 0.05 * (1.0 - depth);
                
                // Tornar a água mais opaca
                gl_FragColor = vec4(color, 0.98); // Aumentar ainda mais a opacidade
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    
    scene.add(ocean);
    console.log("Oceano realista criado com shader avançado");
    
    return ocean;
}

function createPlayer() {
    const geometry = new THREE.BoxGeometry(2, 0.2, 1);
    const material = new THREE.MeshPhongMaterial({ 
        map: textures.wood,
        color: 0x8B4513,
        shininess: 60
    });
    
    player = new THREE.Mesh(geometry, material);
    player.position.y = 0.5;
    player.userData.speed = 0.1;
    
    scene.add(player);
    console.log("Jogador criado com textura");
}

function createIslands() {
    for (let i = 0; i < 5; i++) {
        const geometry = new THREE.SphereGeometry(2, 16, 12);
        
        // Deformar a geometria para parecer mais natural
        const positions = geometry.attributes.position;
        for (let j = 0; j < positions.count; j++) {
            const vertex = new THREE.Vector3();
            vertex.fromBufferAttribute(positions, j);
            
            // Adicionar ruído à superfície
            const noise = Math.sin(vertex.x * 2) * Math.cos(vertex.z * 2) * 0.2;
            vertex.y += noise;
            
            positions.setXYZ(j, vertex.x, vertex.y, vertex.z);
        }
        
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({ 
            map: textures.island,
            roughness: 0.8,
            metalness: 0.1
        });
        
        const island = new THREE.Mesh(geometry, material);
        
        island.position.x = Math.random() * 100 - 50;
        island.position.z = Math.random() * 100 - 50;
        island.position.y = 0;
        island.userData.lastCollected = 0;
        
        // Adicionar vegetação melhorada
        addVegetation(island);
        
        islands.push(island);
        scene.add(island);
        console.log(`Ilha ${i} criada com textura`);
    }
}

function addVegetation(island) {
    // Adicionar algumas árvores simples
    for (let i = 0; i < 5; i++) {
        const treeHeight = Math.random() * 1 + 0.5;
        const treeGeometry = new THREE.ConeGeometry(0.3, treeHeight, 8);
        const treeMaterial = new THREE.MeshPhongMaterial({ color: 0x006400 });
        const tree = new THREE.Mesh(treeGeometry, treeMaterial);
        
        // Posicionar árvore aleatoriamente na ilha
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 1.5;
        tree.position.x = Math.cos(angle) * radius;
        tree.position.z = Math.sin(angle) * radius;
        tree.position.y = 2 + treeHeight / 2;
        
        island.add(tree);
    }
}

function handleMovement() {
    const speed = player.userData.speed || 0.1;
    
    if (keys.w) player.position.z -= speed;
    if (keys.s) player.position.z += speed;
    if (keys.a) player.position.x -= speed;
    if (keys.d) player.position.x += speed;
    
    // Aplicar a física das ondas ao jogador
    const time = clock.getElapsedTime();
    const waveHeight = getWaveHeight(player.position.x, player.position.z, time);
    
    // Ajustar a altura do jogador com base na onda
    // Quanto mais evoluído o veículo, menos ele é afetado pelas ondas
    let waveEffect = 1.0;
    if (collectibles >= 6) {
        waveEffect = 0.3; // Barco é menos afetado
    } else if (collectibles >= 3) {
        waveEffect = 0.6; // Caiaque é moderadamente afetado
    }
    
    // Altura base + efeito da onda
    player.position.y = 0.5 + waveHeight * waveEffect;
    
    // Inclinar o jogador com base na inclinação da onda
    const waveGradientX = (getWaveHeight(player.position.x + 0.1, player.position.z, time) - 
                          getWaveHeight(player.position.x - 0.1, player.position.z, time)) * 5;
    const waveGradientZ = (getWaveHeight(player.position.x, player.position.z + 0.1, time) - 
                          getWaveHeight(player.position.x, player.position.z - 0.1, time)) * 5;
    
    // Aplicar rotação com base na inclinação da onda
    player.rotation.z = -waveGradientX * waveEffect;
    player.rotation.x = waveGradientZ * waveEffect;
    
    // Atualiza a câmera
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Atualizar shader da água
    if (ocean && ocean.material.uniforms) {
        ocean.material.uniforms.time.value = time;
        ocean.material.uniforms.cameraPosCustom.value.copy(camera.position);
    }
    
    // Atualizar aurora
    if (aurora && aurora.material.uniforms) {
        aurora.material.uniforms.time.value = time;
    }
    
    // Movimentação
    handleMovement();
    
    // Verificar colisões
    checkCollisions();
    
    // Atualizar ciclo dia/noite
    updateDayNightCycle();
    
    // Atualizar tubarão
    updateShark();
    
    // Atualizar viewVector do glow do sol
    if (sun && sun.children[0] && sun.children[0].material.uniforms) {
        sun.children[0].material.uniforms.viewVector.value.copy(camera.position);
    }
    
    // Renderizar cena
    renderer.render(scene, camera);
}

// Ajustar tamanho da janela
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log("Script carregado");

// Adicionar função para verificar colisões
function checkCollisions() {
    islands.forEach(island => {
        const distance = player.position.distanceTo(island.position);
        const now = Date.now();
        
        if (distance < 3 && now - island.userData.lastCollected > 5000) {
            collectibles++;
            score += 100;
            island.userData.lastCollected = now;
            
            const items = ['concha', 'madeira', 'garrafa', 'pérola', 'rede'];
            const item = items[Math.floor(Math.random() * items.length)];
            console.log(`Item coletado: ${item}`);
            
            updatePlayerVehicle();
            updateScoreDisplay();
        }
    });
}

// Adicionar função para atualizar o veículo do jogador
function updatePlayerVehicle() {
    // Salvar posição e rotação
    const position = player.position.clone();
    const rotation = new THREE.Euler().copy(player.rotation);
    
    // Remover o jogador atual
    scene.remove(player);
    player.geometry.dispose();
    player.material.dispose();
    
    // Criar novo veículo baseado nos itens coletados
    let size, color, speed;
    
    if (collectibles >= 6) {
        // Mini barco
        size = [4, 1, 2];
        color = 0x4682B4;
        speed = 0.3;
        console.log("Evoluiu para mini barco!");
    } else if (collectibles >= 3) {
        // Caiaque
        size = [3, 0.5, 1];
        color = 0x404040;
        speed = 0.2;
        console.log("Evoluiu para caiaque!");
    } else {
        // Prancha
        size = [2, 0.2, 1];
        color = 0x8B4513;
        speed = 0.1;
    }
    
    const geometry = new THREE.BoxGeometry(...size);
    const material = new THREE.MeshPhongMaterial({ 
        map: textures.wood,
        color: color,
        shininess: 60
    });
    
    player = new THREE.Mesh(geometry, material);
    player.position.copy(position);
    player.rotation.copy(rotation);
    player.userData.speed = speed;
    
    scene.add(player);
}

// Adicionar função para atualizar a pontuação
function createScoreDisplay() {
    const scoreDiv = document.getElementById('score');
    if (scoreDiv) {
        scoreDiv.textContent = `Pontuação: ${score}`;
    }
}

function updateScoreDisplay() {
    const scoreDiv = document.getElementById('score');
    if (scoreDiv) {
        scoreDiv.textContent = `Pontuação: ${score}`;
    }
}

// Adicionar função para ciclo dia/noite
function updateDayNightCycle() {
    const time = clock.getElapsedTime() * 0.1;
    const intensity = Math.sin(time) * 0.5 + 0.5;
    
    // Atualizar shader do céu
    if (sky && sky.material.uniforms) {
        sky.material.uniforms.time.value = time;
        sky.material.uniforms.dayNightMix.value = intensity;
    }
    
    // Mover o sol no arco do céu
    if (sun) {
        const sunAngle = time * Math.PI;
        const sunHeight = Math.sin(sunAngle) * 200;
        const sunDistance = Math.cos(sunAngle) * 400;
        
        sun.position.set(player.position.x + sunDistance, sunHeight, player.position.z - 200);
        
        // Aumentar o brilho do sol durante o dia
        const sunIntensity = Math.max(0, intensity * 1.5 - 0.3);
        sun.material.opacity = sunIntensity;
        
        // Atualizar glow do sol
        if (sun.children[0] && sun.children[0].material.uniforms) {
            sun.children[0].material.uniforms.viewVector.value.copy(camera.position);
        }
    }
    
    // Mover a lua no arco oposto do céu
    if (moon) {
        const moonAngle = time * Math.PI + Math.PI; // Oposto ao sol
        const moonHeight = Math.sin(moonAngle) * 150;
        const moonDistance = Math.cos(moonAngle) * 300;
        
        moon.position.set(player.position.x + moonDistance, moonHeight, player.position.z - 200);
        
        // Mostrar lua apenas durante a noite
        moon.visible = intensity < 0.3;
    }
    
    // Mudar cor do céu - não mais necessário pois o shader cuida disso
    // scene.background = new THREE.Color().lerpColors(nightColor, dayColor, intensity);
    
    // Atualizar iluminação
    scene.children.forEach(child => {
        if (child instanceof THREE.DirectionalLight) {
            child.intensity = intensity + 0.2;
            
            // Movimentar a luz direcional com o sol
            if (sun) {
                child.position.copy(sun.position);
            }
        }
    });
    
    isNight = intensity < 0.3;
    
    // Chance de aparecer aurora durante a noite
    if (isNight && !aurora && Math.random() < 0.001 && player.position.x > 50) {
        createAurora();
    }
}

// Adicionar função para criar aurora
function createAurora() {
    const geometry = new THREE.PlaneGeometry(200, 50);
    const material = new THREE.ShaderMaterial({
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
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    aurora = new THREE.Mesh(geometry, material);
    aurora.position.set(player.position.x, 100, player.position.z);
    aurora.rotation.x = Math.PI / 3;
    scene.add(aurora);
    
    console.log("Aurora criada!");
    
    setTimeout(() => {
        scene.remove(aurora);
        aurora = null;
    }, 30000);
}

// Adicionar função para criar tubarão
function createShark() {
    // Grupo para o tubarão
    shark = new THREE.Group();
    
    // Corpo do tubarão
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.8, 4, 8);
    bodyGeometry.rotateZ(Math.PI / 2);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x0A1929 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    shark.add(body);
    
    // Barbatana dorsal
    const finGeometry = new THREE.ConeGeometry(0.5, 1, 4);
    finGeometry.rotateX(Math.PI / 2);
    const finMaterial = new THREE.MeshPhongMaterial({ color: 0x0A1929 });
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    fin.position.set(0, 1, 0);
    shark.add(fin);
    
    // Posicionar o tubarão
    const angle = Math.random() * Math.PI * 2;
    const distance = 25;
    shark.position.x = player.position.x + Math.cos(angle) * distance;
    shark.position.z = player.position.z + Math.sin(angle) * distance;
    shark.position.y = 0.5;
    
    // Guardar posição central para movimento circular
    shark.userData.centerX = shark.position.x;
    shark.userData.centerZ = shark.position.z;
    shark.userData.startTime = clock.getElapsedTime();
    
    scene.add(shark);
    console.log("Tubarão criado!");
    
    setTimeout(() => {
        scene.remove(shark);
        shark = null;
    }, 30000);
}

// Adicionar função para atualizar o tubarão
function updateShark() {
    if (shark) {
        const time = clock.getElapsedTime();
        const startTime = shark.userData.startTime;
        const elapsedTime = time - startTime;
        
        // Movimento circular
        const radius = 10;
        const centerX = shark.userData.centerX;
        const centerZ = shark.userData.centerZ;
        
        shark.position.x = centerX + Math.cos(elapsedTime) * radius;
        shark.position.z = centerZ + Math.sin(elapsedTime) * radius;
        
        // Rotação para olhar na direção do movimento
        shark.rotation.y = elapsedTime + Math.PI / 2;
        
        // Efeito no jogador quando próximo
        const distanceToPlayer = shark.position.distanceTo(player.position);
        if (distanceToPlayer < 5) {
            // Menos efeito no barco, mais na prancha
            const effectIntensity = collectibles >= 6 ? 0.2 : 1.0;
            player.position.y = 0.5 + Math.sin(time * 5) * 0.3 * effectIntensity;
        }
    } else if (Math.random() < 0.0008) { // ~5% por minuto
        createShark();
    }
}

// Adicionar função para calcular a altura da onda em uma posição específica
function getWaveHeight(x, z, time) {
    // Usar as mesmas fórmulas de onda do shader (mais suaves)
    const wave1 = Math.sin(x * 0.01 + time * 0.2) * 
                 Math.cos(z * 0.01 + time * 0.15) * 0.5;
    const wave2 = Math.sin(x * 0.02 + time * 0.15) * 0.3;
    const wave3 = Math.cos(z * 0.02 + time * 0.2) * 0.3;
    const wave4 = Math.sin(x * 0.05 + z * 0.05 + time * 0.25) * 0.15;
    
    return wave1 + wave2 + wave3 + wave4;
}

// Adicionar após a função createOcean
function createSky() {
    // Criar céu utilizando uma grande esfera
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    // Inverter a esfera para que as texturas fiquem do lado de dentro
    skyGeometry.scale(-1, 1, 1);
    
    // Carregar texturas do céu
    const dayTexture = textureLoader.load('https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg');
    const nightTexture = textureLoader.load('https://threejs.org/examples/textures/stars.jpg');
    const cloudTexture = textureLoader.load('https://threejs.org/examples/textures/cloud.png');
    
    cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
    cloudTexture.repeat.set(8, 4);
    
    // Criar shader material para o céu
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            dayTexture: { value: dayTexture },
            nightTexture: { value: nightTexture },
            cloudTexture: { value: cloudTexture },
            time: { value: 0 },
            dayNightMix: { value: 1.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPos;
            
            void main() {
                vUv = uv;
                vPos = position.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform sampler2D cloudTexture;
            uniform float time;
            uniform float dayNightMix;
            
            varying vec2 vUv;
            varying vec3 vPos;
            
            void main() {
                // Coordenadas para textura de nuvens se movendo
                vec2 cloudUv = vUv + vec2(time * 0.01, 0.0);
                
                // Amostra de nuvens com transparência variável
                vec4 clouds = texture2D(cloudTexture, cloudUv);
                
                // Textura de dia e noite
                vec4 dayColor = texture2D(dayTexture, vUv);
                vec4 nightColor = texture2D(nightTexture, vUv);
                
                // Misturar dia e noite com base na hora
                vec4 baseColor = mix(nightColor, dayColor, dayNightMix);
                
                // Adicionar nuvens com base na transparência
                float cloudFactor = dayNightMix * 0.9; // Reduzir visibilidade das nuvens à noite
                vec4 finalColor = mix(baseColor, vec4(1.0, 1.0, 1.0, 1.0), clouds.r * cloudFactor * 0.7);
                
                gl_FragColor = finalColor;
            }
        `,
        side: THREE.BackSide
    });
    
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);
    
    console.log("Céu criado com sol, nuvens e estrelas");
    
    return sky;
}

// Criar sol
function createSun() {
    const sunGeometry = new THREE.SphereGeometry(10, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff80,
        transparent: true,
        opacity: 0.8
    });
    
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(100, 100, -100);
    
    // Adicionar glow ao sol
    const sunGlowGeometry = new THREE.SphereGeometry(12, 16, 16);
    const sunGlowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(0xffff00) },
            viewVector: { value: new THREE.Vector3() }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                vec3 vNormal = normalize(normal);
                intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            varying float intensity;
            void main() {
                vec3 glow = glowColor * intensity;
                gl_FragColor = vec4(glow, 1.0);
            }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    sun.add(sunGlow);
    
    scene.add(sun);
    console.log("Sol criado");
    
    return sun;
}

// Criar lua
function createMoon() {
    const moonGeometry = new THREE.SphereGeometry(5, 16, 16);
    const moonTexture = textureLoader.load('https://threejs.org/examples/textures/planets/moon_1024.jpg');
    const moonMaterial = new THREE.MeshPhongMaterial({
        map: moonTexture,
        shininess: 5,
        emissive: 0x222222
    });
    
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(-100, 50, -100);
    moon.visible = false; // Inicialmente oculta durante o dia
    
    scene.add(moon);
    console.log("Lua criada");
    
    return moon;
} 