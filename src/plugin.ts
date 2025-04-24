import type { Penpot as PenpotType } from '@penpot/plugin-types';

declare const penpot: PenpotType;

// Configuración de OpenAI
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4';

type Foundations = Record<string, any>;
type OpenAIResponse = { nodes: Array<{ type: string; position: { x: number; y: number }; size?: { width: number; height: number }; style: any; content?: string; }> };
type MessagePayload = { type: string; data: string };
type UIMessage = { pluginMessage?: MessagePayload };

async function main() {
  try {
    const foundations = await penpot.storage.getItem<Foundations>('foundations');
    if (!foundations) return requestFoundationsUpload();
    const apiKey = await penpot.storage.getItem<string>('openai_api_key');
    if (!apiKey) return requestApiKeyInput();
    await penpot.ui.showToast('🎉 Plugin listo. Ingresa un prompt para generar UI.');
    await requestPromptInput();
  } catch (err) {
    console.error('Error en main:', err);
  }
}

async function requestFoundationsUpload() {
  const html = `<div style="padding:16px;font-family:sans-serif;"><h2>Importa JSON de Foundations</h2><input id="file" type="file" accept="application/json"/><button id="load" disabled>Cargar Foundations</button></div>`;
  await penpot.ui.showUI({ width: 300, height: 200 }, html);
  penpot.ui.on('message', async (msg: UIMessage) => {
    const p = msg.pluginMessage;
    if (p?.type==='foundations-json') {
      try {
        const data=JSON.parse(p.data) as Foundations;
        await penpot.storage.setItem('foundations',data);
        await penpot.ui.showToast('✅ Foundations importados');
        penpot.ui.close(); main();
      } catch(e){ console.error(e); await penpot.ui.showToast('❌ Error al parsear JSON'); }
    }
  });
  penpot.ui.postMessage({type:'inject-script',script:`const input=document.getElementById('file'),btn=document.getElementById('load');input.addEventListener('change',()=>btn.disabled=!input.files.length);btn.addEventListener('click',()=>{const r=new FileReader();r.onload=()=>parent.postMessage({pluginMessage:{type:'foundations-json',data:r.result}},'*');r.readAsText(input.files[0]);});`});
}

async function requestApiKeyInput() {
  const html=`<div style="padding:16px;font-family:sans-serif;"><h2>API Key OpenAI</h2><input id="key" type="password" style="width:100%;"/><button id="save" disabled>Guardar</button></div>`;
  await penpot.ui.showUI({width:300,height:180},html);
  penpot.ui.on('message',async(msg:UIMessage)=>{const p=msg.pluginMessage; if(p?.type==='api-key'){await penpot.storage.setItem('openai_api_key',p.data); await penpot.ui.showToast('🔑 API Key guardada'); penpot.ui.close(); main();}});
  penpot.ui.postMessage({type:'inject-script',script:`const i=document.getElementById('key'),b=document.getElementById('save');i.addEventListener('input',()=>b.disabled=!i.value.trim());b.addEventListener('click',()=>parent.postMessage({pluginMessage:{type:'api-key',data:i.value.trim()}},'*'));`});
}

async function requestPromptInput() {
  const html=`<div style="padding:16px;font-family:sans-serif;"><h2>Describe el componente UI</h2><textarea id="prompt" rows="4" style="width:100%;font-size:14px;"></textarea><button id="go" disabled>Generar</button></div>`;
  await penpot.ui.showUI({width:350,height:260},html);
  penpot.ui.on('message',async(msg:UIMessage)=>{const p=msg.pluginMessage; if(p?.type==='user-prompt'){penpot.ui.close(); await generateUI(p.data);}});
  penpot.ui.postMessage({type:'inject-script',script:`const i=document.getElementById('prompt'),b=document.getElementById('go');i.addEventListener('input',()=>b.disabled=!i.value.trim());b.addEventListener('click',()=>parent.postMessage({pluginMessage:{type:'user-prompt',data:i.value.trim()}},'*'));`});
}

async function generateUI(prompt:string){
  try{
    const foundations=await penpot.storage.getItem<Foundations>('foundations')!;
    const apiKey=await penpot.storage.getItem<string>('openai_api_key')!;
    const sys=`Eres un asistente que genera nodos usando estos foundations:\n${JSON.stringify(foundations)}`;
    const res=await fetch(OPENAI_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:OPENAI_MODEL,messages:[{role:'system',content:sys},{role:'user',content:prompt}],temperature:0.7})});
    const data=await res.json();const content=data.choices?.[0]?.message?.content; if(!content)throw Error('Sin contenido');
    const ui=JSON.parse(content) as OpenAIResponse; await placeNodes(ui.nodes);
  }catch(e){console.error(e);await penpot.ui.showToast('❌ Error generando UI');}
}

async function placeNodes(nodes:OpenAIResponse['nodes']){
  for(const n of nodes){try{if(n.type==='RECTANGLE')await penpot.content.createRectangle({position:n.position,size:n.size!,style:n.style});else if(n.type==='TEXT')await penpot.content.createText({position:n.position,text:n.content||'',style:n.style});}catch(e){console.error('Node error',n,e);}}
}

main().catch(e=>console.error('main final',e));