import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Component } from "@oh-my-pi/pi-tui";
import { SelectList, replaceTabs, truncateToWidth } from "@oh-my-pi/pi-tui";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";

type InteractionOption={id:string;label:string;description?:string};
type InteractionRequest={id:string;type:"STATUS"|"NOTICE"|"DECISION"|"BLOCK";title:string;message?:string;reason?:string;options?:InteractionOption[];context?:Record<string,unknown>;blocking:boolean;createdAt:string};
type HostResult={state:"SILENT"|"MANAGED"|"DECISION"|"DECISION_MCP"|"BLOCKED";targetArtifactId?:string;contextSummary?:string;interaction?:InteractionRequest;decisionResolved?:{interactionId:string;optionId:string};blockTransition?:{interactionId:string;action:"returned_to_design"|"resolved"};checkpoint?:unknown};
type JsonEnvelope<T>={ok:boolean;data:T;warnings?:string[];error?:{code:string;message:string}};

const BRIDGE_SCOPE:"global"|"project"="global";
const EXTENSION_FILE=resolve(fileURLToPath(import.meta.url));
const WIDGET_KEY="continuum-managed-work";
const UI_WAIT_TIMEOUT_MS=25_000;


function findContinuumRoot(start:string):string|undefined{
  let current=resolve(start);
  while(true){
    if(existsSync(join(current,".continuum","project.yaml"))) return current;
    const parent=dirname(current);
    if(parent===current) return undefined;
    current=parent;
  }
}

function shouldHandleLifecycle(ctx:any):boolean{
  const root=findContinuumRoot(ctx.cwd);
  if(!root) return false;
  if(BRIDGE_SCOPE==="project") return true;
  const legacy=resolve(join(root,".omp","extensions","continuum.ts"));
  return !existsSync(legacy) || legacy===EXTENSION_FILE;
}

function invocation(args:string[]){
  const cliBin=process.env.CONTINUUM_CLI_BIN?.trim();
  if(cliBin) return {command:cliBin,args};
  const entry=process.env.CONTINUUM_CLI_ENTRY?.trim();
  if(entry){
    const nodeBin=process.env.CONTINUUM_NODE_BIN?.trim() || "node";
    return {command:nodeBin,args:[entry,...args]};
  }
  return {command:"continuum",args};
}

function runContinuum<T>(cwd:string,args:string[],stdin?:unknown):T{
  const call=invocation([...args,"--json"]);
  const result=spawnSync(call.command,call.args,{cwd,encoding:"utf8",env:process.env,input:stdin===undefined?undefined:JSON.stringify(stdin)});
  const stdout=(result.stdout||"").trim();
  if(!stdout) throw new Error((result.stderr||"").trim()||`Continuum exited ${result.status}`);
  const parsed=JSON.parse(stdout) as JsonEnvelope<T>;
  if(!parsed.ok) throw new Error(parsed.error?.message||"Continuum command failed");
  return parsed.data;
}

function sessionId(ctx:any):string{
  return String(ctx.sessionManager.getSessionId?.() ?? "").trim();
}

function widget(ctx:any,target?:string){
  if(!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_KEY,target?[`Continuum · ${target}`]:undefined,{placement:"aboveEditor"});
}

function optionLabel(option:InteractionOption):string{
  return option.description?`${option.label} — ${option.description}`:option.label;
}

class DecisionOverlay implements Component {
  readonly list:SelectList;
  constructor(
    private readonly request:InteractionRequest,
    private readonly keybindings:any,
    private readonly done:(value:string|undefined)=>void,
  ){
    this.list=new SelectList((request.options??[]).map(option=>({value:option.id,label:optionLabel(option)})),8,getSelectListTheme());
    this.list.onSelect=item=>this.done(item.value);
    this.list.onCancel=()=>this.done(undefined);
  }
  handleInput(data:string):void{
    if(this.keybindings.matches(data,"app.interrupt")){this.done(undefined);return;}
    this.list.handleInput(data);
  }
  render(width:number):readonly string[]{
    const header=[this.request.title,this.request.message??this.request.reason??"Continuum needs a decision.",""];
    return [...header,...this.list.render(width)].map(line=>truncateToWidth(replaceTabs(line),width));
  }
  invalidate():void{this.list.invalidate();}
}

type BlockAction="return-to-design"|"dismiss";

class BlockOverlay implements Component {
  readonly list:SelectList;
  constructor(
    private readonly request:InteractionRequest,
    private readonly keybindings:any,
    private readonly done:(value:BlockAction|undefined)=>void,
  ){
    const items=[
      {value:"return-to-design",label:"回到设计处理 — 暂停当前实现，保留设计问题"},
      {value:"dismiss",label:"暂时关闭 — P03 仍保持暂停"},
    ];
    this.list=new SelectList(items,items.length,getSelectListTheme());
    this.list.onSelect=item=>this.done(item.value as BlockAction);
    this.list.onCancel=()=>this.done(undefined);
  }
  handleInput(data:string):void{
    if(this.keybindings.matches(data,"app.interrupt")){this.done(undefined);return;}
    this.list.handleInput(data);
  }
  render(width:number):readonly string[]{
    const lines=[`Continuum`,this.request.title,this.request.message??this.request.reason??"当前实现需要先回到设计层处理。","",...this.list.render(width)];
    return lines.map(line=>truncateToWidth(replaceTabs(line),width));
  }
  invalidate():void{this.list.invalidate();}
}

function isHeavyDecision(request:InteractionRequest):boolean{
  return /architecture|ADR|架构/i.test(`${request.title}\n${request.reason??""}`) || (request.message?.length??0)>220;
}

async function resolveDecision(cwd:string,ctx:any,request:InteractionRequest):Promise<{selected?:string;restartedWork?:any}> {
  if(!ctx.hasUI) return {};
  let selected:string|undefined;
  if(isHeavyDecision(request)){
    let doneRef:((value:string|undefined)=>void)|undefined;
    const timer=ctx.setTimeout(()=>doneRef?.(undefined),UI_WAIT_TIMEOUT_MS);
    try{
      selected=await ctx.ui.custom<string|undefined>((_tui:any,_theme:any,keybindings:any,done:(value:string|undefined)=>void)=>{doneRef=done;return new DecisionOverlay(request,keybindings,done);},{overlay:true});
    }finally{ctx.clearTimer(timer);}
  }else{
    const labels=(request.options??[]).map(optionLabel);
    const value=await ctx.ui.select(request.title,labels,{timeout:UI_WAIT_TIMEOUT_MS});
    selected=(request.options??[]).find(option=>optionLabel(option)===value)?.id;
  }
  if(!selected) return {};
  const sid=sessionId(ctx);
  const result=runContinuum<any>(cwd,["host","omp","interaction","resolve",request.id,"--option",selected,...(sid?["--session",sid]:[])]);
  const current=runContinuum<any>(cwd,["work","current",...(sid?["--session",sid,"--host","omp"]:[])]);
  widget(ctx,current.binding?.targetArtifactId);
  return {selected,restartedWork:result?.restartedWork};
}

async function showImplementationBlock(ctx:any,request:InteractionRequest):Promise<BlockAction|undefined>{
  if(!ctx.hasUI) return undefined;
  let doneRef:((value:BlockAction|undefined)=>void)|undefined;
  const timer=ctx.setTimeout(()=>doneRef?.(undefined),UI_WAIT_TIMEOUT_MS);
  try{
    return await ctx.ui.custom<BlockAction|undefined>((_tui:any,_theme:any,keybindings:any,done:(value:BlockAction|undefined)=>void)=>{doneRef=done;return new BlockOverlay(request,keybindings,done);},{overlay:true});
  }finally{ctx.clearTimer(timer);}
}

function blockPhase(request:InteractionRequest):"implementation"|"design"{
  return request.context?.blockPhase==="design"?"design":"implementation";
}

function eventPayload(eventName:string,ctx:any,prompt?:string){
  return {event_name:eventName,cwd:ctx.cwd,session_id:sessionId(ctx),...(prompt!==undefined?{prompt}:{}),has_ui:Boolean(ctx.hasUI)};
}

function traceEvent(payload:any,result?:HostResult,error?:unknown):void{
  const path=process.env.CONTINUUM_OMP_TRACE_FILE?.trim();
  if(!path) return;
  try{
    appendFileSync(path,JSON.stringify({
      ts:new Date().toISOString(),
      event_name:payload.event_name,
      cwd:payload.cwd,
      session_id:payload.session_id,
      prompt:payload.prompt,
      result:result?{state:result.state,targetArtifactId:result.targetArtifactId}:undefined,
      error:error instanceof Error?error.message:error?String(error):undefined,
    })+"\n","utf8");
  }catch{}
}

function traceUiAction(ctx:any,request:InteractionRequest,action:string,error?:unknown):void{
  traceEvent({event_name:"ui_block_action",cwd:ctx.cwd,session_id:sessionId(ctx),prompt:`${request.id}:${action}`},undefined,error);
}

function callEvent(ctx:any,eventName:string,prompt?:string):HostResult{
  const payload=eventPayload(eventName,ctx,prompt);
  try{
    const result=runContinuum<HostResult>(ctx.cwd,["host","omp","event",...(BRIDGE_SCOPE==="global"?["--global"]:[])],payload);
    traceEvent(payload,result);
    return result;
  }catch(error){
    traceEvent(payload,undefined,error);
    throw error;
  }
}

async function renderLifecycleResult(ctx:any,result:HostResult):Promise<{message?:any;blocked?:boolean}>{
  if(result.blockTransition){
    widget(ctx,undefined);
    ctx.ui.notify?.(result.blockTransition.action==="returned_to_design"
      ? "已返回设计阶段。完成相关 Spec / ADR 调整后，直接再次开始原工作。"
      : "设计问题已处理。","info");
    return {blocked:true};
  }
  if(result.state==="MANAGED"){
    widget(ctx,result.targetArtifactId);
    return result.contextSummary?{message:{customType:"continuum_context",content:result.contextSummary,display:false,attribution:"agent"}}:{};
  }
  if(result.state==="DECISION"&&result.interaction){
    const decision=await resolveDecision(ctx.cwd,ctx,result.interaction);
    if(!decision.selected){
      ctx.ui.notify?.("Continuum decision remains pending.","warning");
      return {blocked:true};
    }
    if(result.interaction.context?.kind==="restart-blocked-work"){
      if(decision.selected==="restart-work"){
        const target=String(result.interaction.context?.targetArtifactId??"当前工作");
        ctx.ui.notify?.(`已基于最新设计重新开始 ${target}。`,"info");
        return {message:{customType:"continuum_context",content:`Continuum restarted ${target} with a fresh Work Baseline after explicit design confirmation.`,display:false,attribution:"agent"}};
      }
      widget(ctx,undefined);
      ctx.ui.notify?.("继续保持设计阶段；当前实现仍未重新开始。","info");
      return {blocked:true};
    }
    return {message:{customType:"continuum_decision",content:`Continuum decision resolved: ${decision.selected}.`,display:false,attribution:"agent"}};
  }
  if(result.state==="BLOCKED"&&result.interaction){
    widget(ctx,"action needed");
    if(blockPhase(result.interaction)==="design") {
      traceUiAction(ctx,result.interaction,"design-not-ready");
      const message=result.interaction.message??"上次发现的设计冲突尚未处理。请继续更新相关 Spec / ADR，完成后再次开始当前工作。";
      ctx.ui.notify?.(message,"warning");
      return {blocked:true};
    }
    const action=await showImplementationBlock(ctx,result.interaction);
    if(action==="return-to-design") {
      try{
        const sid=sessionId(ctx);
        runContinuum(ctx.cwd,["block","return-to-design",result.interaction.id,...(sid?["--session",sid,"--host","omp"]:[])]);
        traceUiAction(ctx,result.interaction,"return-to-design");
        widget(ctx,undefined);
        const target=Array.isArray(result.interaction.context?.affectedTickets)?String(result.interaction.context?.affectedTickets?.[0]??"当前工作"):"当前工作";
        ctx.ui.notify?.(`已退出 ${target} 实现。请继续讨论或更新 Spec / ADR；设计完成并提交后，直接再次 implement ${target}。`,"info");
      }catch(error){
        traceUiAction(ctx,result.interaction,"return-to-design",error);
        ctx.ui.notify?.(`Continuum return-to-design failed: ${error instanceof Error?error.message:String(error)}`,"error");
      }
    }else{
      traceUiAction(ctx,result.interaction,"dismiss");
    }
    return {blocked:true};
  }
  return {};
}

export default function continuumExtension(pi:ExtensionAPI):void{
  pi.setLabel("Continuum");
  let resumeContext:string|undefined;

  pi.on("session_start",async(_event,ctx)=>{
    if(!shouldHandleLifecycle(ctx)) return;
    try{
      const result=callEvent(ctx,"session_start");
      const rendered=await renderLifecycleResult(ctx,result);
      if(result.state==="MANAGED") resumeContext=result.contextSummary;
      else if(result.state==="SILENT") widget(ctx,undefined);
      if(rendered.blocked) return;
    }catch(error){
      if(ctx.hasUI) ctx.ui.notify(`Continuum unavailable: ${error instanceof Error?error.message:String(error)}`,"warning");
    }
  });

  pi.on("before_agent_start",async(event:any,ctx:any)=>{
    if(!shouldHandleLifecycle(ctx)) return;
    try{
      const result=callEvent(ctx,"before_agent_start",String(event.prompt??""));
      const rendered=await renderLifecycleResult(ctx,result);
      if(rendered.blocked){ctx.abort();return {message:{customType:"continuum_block",content:"Continuum blocked this turn until the pending project decision/design issue is resolved.",display:true,attribution:"agent"}};}
      if(rendered.message){resumeContext=undefined;return {message:rendered.message};}
      if(resumeContext){const value=resumeContext;resumeContext=undefined;return {message:{customType:"continuum_context",content:value,display:false,attribution:"agent"}};}
      return;
    }catch(error){
      ctx.abort();
      return {message:{customType:"continuum_error",content:`Continuum lifecycle check failed: ${error instanceof Error?error.message:String(error)}`,display:true,attribution:"agent"}};
    }
  });

  pi.on("session_stop",async(_event:any,ctx:any)=>{
    if(!shouldHandleLifecycle(ctx)) return;
    try{
      const result=callEvent(ctx,"session_stop");
      if(result.state==="BLOCKED"&&result.interaction){
        widget(ctx,"action needed");
        return {decision:"block",reason:result.interaction.message??result.interaction.reason??result.interaction.title};
      }
      return;
    }catch(error){
      return {decision:"block",reason:`Continuum checkpoint failed: ${error instanceof Error?error.message:String(error)}`};
    }
  });

  pi.on("session_shutdown",async(_event,ctx)=>{
    if(!shouldHandleLifecycle(ctx)){widget(ctx,undefined);return;}
    try{callEvent(ctx,"session_shutdown");}catch{}
    widget(ctx,undefined);
  });

  const z=pi.zod;

  pi.registerTool({
    name:"continuum_init",
    label:"Enable Continuum",
    description:"Enable Continuum for the current Git project. Use only when the user explicitly asks to enable/init Continuum for this project.",
    parameters:z.object({name:z.string().optional().describe("Optional project name")}),
    async execute(_id:any,params:any,_signal:any,_onUpdate:any,ctx:any){
      const args=["init",...(params?.name?["--name",String(params.name)]:[])];
      const data=runContinuum<any>(ctx.cwd,args);
      return {content:[{type:"text",text:`Continuum enabled for ${data.name??"current project"}.`}],details:data};
    },
  });

  pi.registerTool({
    name:"continuum_status",
    label:"Continuum Status",
    description:"Read deterministic Continuum project/work status for the current project.",
    parameters:z.object({}),
    async execute(_id:any,_params:any,_signal:any,_onUpdate:any,ctx:any){
      const data=runContinuum<any>(ctx.cwd,["status"]);
      return {content:[{type:"text",text:JSON.stringify(data,null,2)}],details:data};
    },
  });

  pi.registerTool({
    name:"continuum_doctor",
    label:"Continuum Doctor",
    description:"Run deterministic Continuum diagnostics for the current project. Use when the user asks to check or repair Continuum state.",
    parameters:z.object({recover:z.boolean().optional()}),
    async execute(_id:any,params:any,_signal:any,_onUpdate:any,ctx:any){
      const data=runContinuum<any>(ctx.cwd,["doctor",...(params?.recover?["--recover"]:[])]);
      return {content:[{type:"text",text:JSON.stringify(data,null,2)}],details:data};
    },
  });

  pi.registerCommand("continuum-status",{
    description:"Show the current Continuum project/work status",
    handler:async(_args,ctx)=>{
      try{
        const status=runContinuum<any>(ctx.cwd,["status"]);
        const target=status.work?.binding?.targetArtifactId as string|undefined;
        widget(ctx,target);
        ctx.ui.notify(target?`Continuum managed work: ${target}`:`Continuum project aware; no managed work.`,"info");
      }catch(error){ctx.ui.notify(`Continuum unavailable: ${error instanceof Error?error.message:String(error)}`,"warning");}
    },
  });


  pi.registerCommand("continuum-off",{
    description:"Suppress Continuum for this OMP session without clearing worktree continuity",
    handler:async(_args,ctx)=>{
      const sid=sessionId(ctx);
      if(!sid){ctx.ui.notify("Continuum could not determine the OMP session id.","error");return;}
      try{
        runContinuum(ctx.cwd,["work","suppress-session","--session",sid,"--host","omp","--reason","omp-session-opt-out"]);
        widget(ctx,undefined);
        ctx.ui.notify("Continuum is suppressed for this OMP session. Worktree continuity is unchanged.","info");
      }catch(error){ctx.ui.notify(`Continuum suppression failed: ${error instanceof Error?error.message:String(error)}`,"error");}
    },
  });
}
