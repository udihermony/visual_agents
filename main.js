import { LMStudioClient } from './lmstudio-wrapper.js';

class AgentVisualization {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.agentBoxes = [];
        this.arrows = [];
        this.boxSpacing = 4;
        this.conversationHistory = [];
        
        // Mouse interaction variables
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.draggedObject = null;
        this.offset = new THREE.Vector3();
        this.plane = new THREE.Plane();
        this.intersection = new THREE.Vector3();
        
        this.init();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Setup camera
        this.camera.position.z = 10;
        this.camera.position.y = 2;

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);

        // Setup event listeners
        window.addEventListener('resize', () => this.onWindowResize());
        document.getElementById('submit-prompt').addEventListener('click', () => this.handlePrompt());
        document.getElementById('prompt-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handlePrompt();
            }
        });

        // Mouse interaction events
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());

        // Start animation loop
        this.animate();
    }

    onMouseDown(event) {
        event.preventDefault();
        
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Find intersections with boxes
        const intersects = this.raycaster.intersectObjects(this.agentBoxes.map(box => box.box));

        if (intersects.length > 0) {
            this.draggedObject = intersects[0].object;
            
            // Calculate offset
            this.plane.setFromNormalAndCoplanarPoint(
                this.camera.getWorldDirection(this.plane.normal),
                this.draggedObject.position
            );
            
            this.raycaster.ray.intersectPlane(this.plane, this.intersection);
            this.offset.copy(this.intersection).sub(this.draggedObject.position);
        }
    }

    onMouseMove(event) {
        event.preventDefault();
        
        if (this.draggedObject) {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.ray.intersectPlane(this.plane, this.intersection);
            
            // Update box position
            this.draggedObject.position.copy(this.intersection.sub(this.offset));
            
            // Update associated sprites
            const boxIndex = this.agentBoxes.findIndex(box => box.box === this.draggedObject);
            if (boxIndex !== -1) {
                const { labelSprite, contentSprite } = this.agentBoxes[boxIndex];
                labelSprite.position.copy(this.draggedObject.position).add(new THREE.Vector3(0, 1.5, 0.51));
                contentSprite.position.copy(this.draggedObject.position).add(new THREE.Vector3(0, 0, 0.51));
            }
            
            // Update arrows
            this.updateArrows();
        }
    }

    onMouseUp() {
        this.draggedObject = null;
    }

    updateArrows() {
        // Remove old arrows
        this.arrows.forEach(({ arrow, head }) => {
            this.scene.remove(arrow);
            this.scene.remove(head);
        });
        this.arrows = [];

        // Create new arrows
        for (let i = 1; i < this.agentBoxes.length; i++) {
            this.createArrow(i - 1, i);
        }
    }

    addMessageToUI(role, content) {
        const conversationContainer = document.getElementById('conversation-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.textContent = content;
        conversationContainer.appendChild(messageDiv);
        conversationContainer.scrollTop = conversationContainer.scrollHeight;
    }

    createTextCanvas(text, width = 256, height = 128) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        
        // Set background
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, width, height);
        
        // Set text style
        context.fillStyle = '#ffffff';
        context.font = '16px Arial';
        
        // Word wrap the text
        const words = text.split(' ');
        let line = '';
        let y = 20;
        const lineHeight = 20;
        const maxWidth = width - 20;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                context.fillText(line, 10, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, 10, y);
        
        return canvas;
    }

    createAgentBox(index, label, content) {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({
            color: index % 2 === 0 ? 0x4CAF50 : 0x2196F3,
            transparent: true,
            opacity: 0.8
        });
        const box = new THREE.Mesh(geometry, material);
        
        // Position the box
        box.position.x = index * this.boxSpacing;
        box.position.y = 0;
        
        // Add label
        const labelCanvas = this.createTextCanvas(label, 256, 64);
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
        const labelSprite = new THREE.Sprite(labelMaterial);
        labelSprite.position.set(box.position.x, box.position.y + 1.5, box.position.z + 0.51);
        labelSprite.scale.set(2, 0.5, 1);

        // Add content
        const contentCanvas = this.createTextCanvas(content);
        const contentTexture = new THREE.CanvasTexture(contentCanvas);
        const contentMaterial = new THREE.SpriteMaterial({ map: contentTexture });
        const contentSprite = new THREE.Sprite(contentMaterial);
        contentSprite.position.set(box.position.x, box.position.y, box.position.z + 0.51);
        contentSprite.scale.set(2, 1, 1);
        
        this.scene.add(box);
        this.scene.add(labelSprite);
        this.scene.add(contentSprite);
        this.agentBoxes.push({ box, labelSprite, contentSprite, label, content });

        // Create arrow if this isn't the first box
        if (index > 0) {
            this.createArrow(index - 1, index);
        }

        return box;
    }

    createArrow(fromIndex, toIndex) {
        const fromBox = this.agentBoxes[fromIndex].box;
        const toBox = this.agentBoxes[toIndex].box;

        const start = new THREE.Vector3(fromBox.position.x + 1, fromBox.position.y, fromBox.position.z);
        const end = new THREE.Vector3(toBox.position.x - 1, toBox.position.y, toBox.position.z);

        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        direction.normalize();

        const arrowGeometry = new THREE.CylinderGeometry(0.05, 0.05, length, 8);
        const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);

        arrow.position.copy(start).add(direction.multiplyScalar(length / 2));
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        const headGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
        const head = new THREE.Mesh(headGeometry, arrowMaterial);
        head.position.copy(end);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        this.scene.add(arrow);
        this.scene.add(head);
        this.arrows.push({ arrow, head });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }

    async handlePrompt() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput.value.trim();
        
        if (!prompt) return;

        // Add user message to UI
        this.addMessageToUI('user', prompt);

        // Create box for the user's prompt
        this.createAgentBox(this.agentBoxes.length, "User Input", prompt);

        // Initialize LM Studio client
        const client = new LMStudioClient({
            baseUrl: 'http://192.168.1.132:1234',
            headers: {
                'Authorization': 'Bearer sk-1234567890'  // LM Studio default API key
            }
        });

        try {
            const model = await client.llm.model();
            const response = await model.respond([
                { role: 'user', content: prompt }
            ]);

            // Add agent response to UI
            this.addMessageToUI('agent', response);

            // Create box for the agent's response
            this.createAgentBox(this.agentBoxes.length, "Agent Response", response);
            
            // Clear the input
            promptInput.value = '';
        } catch (error) {
            console.error('Error getting response:', error);
            const errorMessage = "Failed to get response from agent";
            this.addMessageToUI('agent', errorMessage);
            this.createAgentBox(this.agentBoxes.length, "Error", errorMessage);
        }
    }
}

// Initialize the visualization
new AgentVisualization(); 