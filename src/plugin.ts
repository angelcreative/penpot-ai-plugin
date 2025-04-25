// src/plugin.ts
import type { Penpot as PenpotType } from '@penpot/plugin-types';

// Obtiene el objeto global de Penpot
const Penpot: PenpotType = (globalThis as any).Penpot || (globalThis as any).penpot;

// Configuración de OpenAI
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4';

type Foundations = Record<string, any>;
type OpenAIResponse = {
  nodes: Array<{
    type: string;
    position: { x: number; y: number };
    size?: { width: number; height: number };
    style: any;
    content?: string;
  }>;
};
type MessagePayload = { type: string; data: string };
type UIMessage = { pluginMessage?: MessagePayload };

// Función principal
async function main() {
  try {
    const foundations = await Penpot.storage.getItem<Foundations>('foundations');
    if (!foundations) {
      return requestFoundationsUpload();
    }
    const apiKey = await Penpot.storage.getItem<string>('openai_api_key');
    if (!apiKey) {
      return requestApiKeyInput();
    }
    await Penpot.ui.showToast('🎉 Plugin listo. Ingresa un prompt para generar UI.');
    await requestPromptInput();
  } catch (err) {
    console.error('main error:', err);
  }
}

// Solicita subir JSON de foundations
async function requestFoundationsUpload() {
  const html = `
<div style="padding:16px;font-family:sans-serif;">
  <h2>Importa JSON de Foundations</h2>
  <input id="file" type="file" accept="application/json" />
  <button id="load" disabled>Cargar Foundations</button>
</div>
`;
  await Penpot.ui.showUI({ width: 300, height: 200 }, html);
  Penpot.ui.on('message', async (msg: UIMessage) => {
    const payload = msg.pluginMessage;
    if (payload?.type === 'foundations-json') {
      try {
        const data = JSON.parse(payload.data) as Foundations;
        await Penpot.storage.setItem('foundations', data);
        await Penpot.ui.showToast('✅ Foundations importados');
        Penpot.ui.close();
        main();
      } catch (error) {
        console.error('JSON parsing error:', error);
        await Penpot.ui.showToast('❌ Error al parsear JSON');
      }
    }
  });
  Penpot.ui.postMessage({
    type: 'inject-script',
    script: `
(function() {
  const input = document.getElementById('file');
  const btn = document.getElementById('load');
  input.addEventListener('change', () => { btn.disabled = !input.files.length; });
  btn.addEventListener('click', () => {
    const reader = new FileReader();
    reader.onload = () => parent.postMessage({ pluginMessage: { type: 'foundations-json', data: reader.result } }, '*');
    reader.readAsText(input.files[0]);
  });
})();`  });
}

// Solicita la API Key de OpenAI
async function requestApiKeyInput() {
  const html = `
<div style="padding:16px;font-family:sans-serif;">
  <h2>Ingresa tu API Key de OpenAI</h2>
  <input id="key" type="password" style="width:100%;" />
  <button id="save" disabled>Guardar</button>
</div>
`;
  await Penpot.ui.showUI({ width: 300, height: 180 }, html);
  Penpot.ui.on('message', async (msg: UIMessage) => {
    const payload = msg.pluginMessage;
    if (payload?.type === 'api-key') {
      await Penpot.storage.setItem('openai_api_key', payload.data);
      await Penpot.ui.showToast('🔑 API Key guardada');
      Penpot.ui.close();
      main();
    }
  });
  Penpot.ui.postMessage({
    type: 'inject-script',
    script: `
(function() {
  const input = document.getElementById('key');
  const btn = document.getElementById('save');
  input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
  btn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'api-key', data: input.value.trim() } }, '*');
  });
})();`  });
}

// Solicita un prompt de usuario
async function requestPromptInput() {
  const html = `
<div style="padding:16px;font-family:sans-serif;">
  <h2>Describe el componente UI</h2>
  <textarea id="prompt" rows="4" style="width:100%;font-size:14px;"></textarea>
  <button id="go" disabled>Generar</button>
</div>
`;
  await Penpot.ui.showUI({ width: 350, height: 260 }, html);
  Penpot.ui.on('message', async (msg: UIMessage) => {
    const payload = msg.pluginMessage;
    if (payload?.type === 'user-prompt') {
      Penpot.ui.close();
      await generateUI(payload.data);
    }
  });
  Penpot.ui.postMessage({
    type: 'inject-script',
    script: `
(function() {
  const input = document.getElementById('prompt');
  const btn = document.getElementById('go');
  input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
  btn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'user-prompt', data: input.value.trim() } }, '*');
  });
})();`  });
}

// Genera UI llamando a OpenAI y crea nodos
async function generateUI(prompt: string) {
  try {
    const foundations = await Penpot.storage.getItem<Foundations>('foundations')!;
    const apiKey = await Penpot.storage.getItem<string>('openai_api_key')!;
    const systemMessage = `Eres un asistente que genera un array JSON de nodos UI usando estos foundations:\n${JSON.stringify(foundations)}`;
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: OPENAI_MODEL, messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ], temperature: 0.7 })
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Sin contenido en la respuesta');
    const ui = JSON.parse(content) as OpenAIResponse;
    await placeNodes(ui.nodes);
  } catch (error) {
    console.error('generateUI error:', error);
    await Penpot.ui.showToast('❌ Error generando UI');
  }
}

// Inserta nodos en el canvas
async function placeNodes(nodes: OpenAIResponse['nodes']) {
  for (const node of nodes) {
    try {
      if (node.type === 'RECTANGLE') {
        await Penpot.content.createRectangle({ position: node.position, size: node.size!, style: node.style });
      } else if (node.type === 'TEXT') {
        await Penpot.content.createText({ position: node.position, text: node.content || '', style: node.style });
      }
    } catch (error) {
      console.error('placeNodes error:', node, error);
    }
  }
}

// Inicia el plugin
main().catch((error) => console.error('main final error:', error));
