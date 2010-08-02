// ==UserScript==
// @name           MeMemo
// @namespace      mememo
// @include        http://renren.com/Home.do*
// @include        http://www.renren.com/Home.do*
// @include        http://localhost*Home.do.html
// @description    为人人网增加背单词的功能
// @version        0.1.0.20100802
// @miniver        6
// @author         pro711
// ==/UserScript==
//
// Copyright (C) 2010 Bill Chen <pro711@gmail.com>
//
// adapted from 校内人人网改造器 Xiaonei Reformer
// Copyright (C) 2008-2010 Xu Zhen
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//




(function(){

if (window.self != window.top) {
	if(document.designMode=="on") {
		// 不在内容可以编辑的frame中运行
		return;
	} else if(document.body && !document.body.id && !document.body.className) {
		// 也不在body没有标记的frame中运行
		return;
	} else if(document.location.href.toLowerCase().indexOf("ajaxproxy")>0) {
		// 也不在ajaxproxy.html中运行
		return;
	}
}

// 基本参数
var MEM={};

// 当前页面
MEM.url=document.location.href;

// 服务器
if ($page('home',MEM.url)) {
	MEM.server = "http://me-memo.appspot.com/"
} else {
	MEM.server = "http://localhost:8080/"
}

// 版本，对应@version和@miniver，用于升级相关功能
MEM.version="0.1.0.20100802";
MEM.miniver=6;

// 存储空间，用于保存全局性变量
MEM.storage={};

// 当前用户ID
MEM.userId=$cookie("id","0");

// 调试模式 TODO
// MEM.debug=false;

// 选项
MEM.options={};

// 当前运行环境（浏览器）
const UNKNOWN=0,USERSCRIPT=1,FIREFOX=2,CHROME=4,SAFARI=8;
MEM.agent=UNKNOWN;
if(window.chrome) {
	MEM.agent=CHROME;
} else if (window.safari) {
	MEM.agent=SAFARI;
} else if (typeof GM_setValue=="function") {
	MEM.agent=USERSCRIPT;
} else if (typeof extServices=="function") {
	MEM.agent=FIREFOX;
}

// 页面工具的简写
var $=PageKit;

// 检查更新
function checkUpdate(evt,checkLink,updateLink,lastCheck) {
	var today=new Date();
	lastCheck=new Date(lastCheck);
	if(isNaN(lastCheck.valueOf())) {
		$save("lastUpdate",today.valueOf());
		lastCheck=today;
	}
	//一天只检查一次
	if(!evt && (today-lastCheck)<3600000*24) {
		return;
	}
	if(evt) {
		$(evt.target).attr({disabled:"disabled",value:"检查中..."});
	}
	$get(checkLink,function(html) {
		if(!html) {
			$save("lastUpdate",today.valueOf());
			return;
		}
		try {
			var miniver=(/@miniver[ \t]+(\d+)/.exec(html) || ["","0"])[1];
			var ver=(/@version[ \t]+([0-9\.]+)/.exec(html) || ["","未知"])[1];
			if(parseInt(miniver)>MEM.miniver) {
				var pop=$popup(null,'<div style="color:black"><div>MeMemo 已有新版本：<br/>'+ver+' ('+miniver+')</div><div class="links" style="padding-top:5px;padding-bottom:5px;float:right"><a target="_blank" href="'+updateLink+'">安装</a></div></div>',null,30,5);
				pop.find(".links a").hook("click",function() {
					pop.remove();
				});
			} else if(evt) {
				// 手动点击检查更新按钮时要弹出提示
				alert("最新版本为："+ver+" ("+miniver+")\n当前版本为："+MEM.version+" ("+MEM.miniver+")\n\n无须更新");
			}

			$(".mem_op #lastUpdate").text($formatDate(today));
			$save("lastUpdate",today.valueOf());

			if(evt) {
				$(evt.target).attr({disabled:null,value:"立即检查"});
			}
		} catch(ex) {
			$error("checkUpdate::$get",ex);
		}
	});
};

// 升级后提示
function updatedNotify(notify,lastVersion) {
	if(notify) {
		var lastVer=parseInt(lastVersion);
		// 首次运行。。？
		if(lastVer>0 && lastVer<MEM.miniver) {
			$popup(null,'<div style="color:black">MeMemo 已经更新到:<br/>'+MEM.version+' ('+MEM.miniver+')</div>',null,20,5);
		}
	}
	$save("lastVersion",MEM.miniver);
};

// 生成诊断信息
function diagnose() {
	var str="";
	str+="运行环境："+window.navigator.userAgent+"\n";
	str+="当前页面："+MEM.url+"\n";
	str+="程序版本："+MEM.version+"("+MEM.miniver+") - "+MEM.agent+"\n";
	str+="功能："+JSON.stringify(MEM.options)+"\n\n";
	$("div.mem_op #diagnosisInfo").value(str);
};


function main(savedOptions) {
	// 选项菜单，定义选项菜单中各个项目
	// 基本格式：
	// {
	//	 类别名称1:[
	//	   {
	//	     // 交互区域1
	//	     参数1:...,
	//	     参数2:...,
	//	   },
	//	   {
	//	     // 交互区域2
	//	     ...
	//	   },
	//	   ...
	//	 ],
	//	 类别名称2:[
	//	   ...
	//	 ],
	//	 ...
	// }
	// 其中，交互区域分为两类，第一种是具体的功能，格式为：
	// {
	//   [String]text:文字+HTML控件描述。例："##选项 数量：##"，表示前后各有一个HTML控件。
	//   [Array]ctrl:如果text中存在控件描述，在这里具体定义。
	//   [Number]agent:执行环境限制。可选。为MEM.agent可定义值的组合
	//   [Boolean]login:用户登录后才执行。可选
	//   [String]page:适用页面。页面名参考$page()，多个名称之间用逗号分隔
	//   [Number]master:主控件序号。当主控件的值为假时，其余控件将被禁用。主控件的type只能为check/edit/input。可选
	// }
	// 功能中ctrl的格式是：
	// [
	//   {
	//     [String]id:控件ID。type为hidden/warn/info时无需id
	//     [String]type:类型，支持如下类型："check"（<input type="checkbox"/>）,"edit"（<textarea/>）,"button"（<input type="button"/>）,"input"（<input/>）,"label"（<span/>）,"hidden"（不生成实际控件）,"warn"（<input type="image"/>）,"info"（<input type="image"/>）,"br"（<article/>）, "link"（<a/>）。默认为check
	//     [Any]value:默认值。type为hidden或readonly为真时可以没有value
	//     [Object]verify:{验证规则:失败信息,...}。验证规则为正则字串。可选
	//     [Object]attr:{属性名:属性值,...}。属性。可选
	//     [String]style:样式。可选
	//     [Boolean]readonly:控件只读。可选
	//     [String]format:值格式。显示时会自动转换。目前只支持"date"。
	//     [Array]fn:处理函数。可选
	//   },
	//   {
	//   	控件2描述...
	//   },
	//   ...
	// ]
	// 功能中fn的格式是：
	// [
	//   {
	//     [Function]name:函数名。
	//     [String/Boolean]fire:函数执行条件。如果为string，则为控件的某一个事件。如果为特殊的"trigger"，则只在trigger触发时执行。否则是控件的期望值。可选。未指定事件为初始化后立即执行。
	//     [Number]stage:执行时机/优先级（0～3）。参考$wait()。
	//     [Object]trigger:设定其他控件的触发事件。{CSS选择器:事件名,...}。可选。如果stage为0，则trigger的执行时机为1，否则与stage相同。
	//     [Array]args:函数参数列表。如果参数为另一控件值/选项组，名称前加@。如果指定了trigger，请将第一个参数设置为null，在事件触发时将用事件对象替代第一个参数
	//   },
	//   {
	//   	函数2描述...
	//   },
	//   ...
	// ]
	//
	//
	// 第二种是选项组，为被多个功能共用的选项集合，格式为：
	// {
	//   [String]id:选项组id。
	//   [String]text:文字描述。可选。文字后将换行列出各选项。
	//   [String]info:帮助信息。可选。
	//   [String]warn:警告信息。可选。
	//   [Array]ctrl:各选项描述。
	//   [Number]column:列数
	// }
	// 选项组中ctrl的格式是
	// [
	//   {
	//     [String]id:控件ID。type为hidden时没有id
	//     [String]text:文字+HTML控件描述。例："##选项"。仅能有一个##
	//     [String]type:类型，支持如下类型："check"（<input type="checkbox"/>）,"edit"（<textarea/>）,"button"（<button/>）,"input"（<input/>）,"label"（<span/>）,"hidden"（不生成实际控件）。默认为check
	//     [Any]value:默认值。
	//     [Object]verify:{验证规则:失败信息,...}。验证规则为正则字串。可选
	//     [String]style:样式。可选
	//   },
	//   {
	//   	控件2描述...
	//   },
	//   ...
	// ]

	var optionMenu={
		"自动更新":[
			{
				text:"##自动检查程序更新##",
				ctrl:[
					{
						id:"checkUpdate",
						value:true,
						fn:[{
							name:checkUpdate,
							stage:2,
							fire:true,
							args:[null,"@checkLink","@updateLink","@lastUpdate"]
						}]
					},{
						type:"info",
						value:"24小时内最多检查一次"
					}
				],
				agent:USERSCRIPT | FIREFOX
			},{
				text:"最后一次检查更新时间：##",
				ctrl:[{
					id:"lastUpdate",
					type:"label",
					value:0,
					format:"date"
				}],
				agent:USERSCRIPT | FIREFOX
			},{
				text:"##",
				ctrl:[{
					type:"button",
					value:"立即检查",
					fn:[{
						name:checkUpdate,
						fire:"click",
						args:[null,"@checkLink","@updateLink","@lastUpdate"]
					}],
				}],
				agent:USERSCRIPT | FIREFOX
			},{
				text:"检查更新地址：##",
				ctrl:[{
					id:"checkLink",
					type:"input",
					value:"http://mememo.googlecode.com/hg/greasemonkey/mememo.user.js",
					style:"width:330px",
					verify:{"[A-Za-z]+://[^/]+\.[^/]+/.*":"请输入正确的检查更新地址"}
				}],
				agent:USERSCRIPT
			},{
				text:"脚本下载地址：##",
				ctrl:[{
					id:"updateLink",
					type:"input",
					value:"http://mememo.googlecode.com/hg/greasemonkey/mememo.user.js",
					style:"width:330px;",
					verify:{"[A-Za-z]+://[^/]+\.[^/]+/.*":"请输入正确的脚本下载地址"},
				}],
				agent:USERSCRIPT
			},{
				text:"##升级后显示通知",
				ctrl:[{
					id:"updatedNotify",
					value:true,
					fn:[{
						name:updatedNotify,		// 无条件执行，当未选中时不提示
						stage:3,
						args:["@updatedNotify","@lastVersion"]
					}]
				}]
			},{
				text:"##",
				ctrl:[{
					id:"lastVersion",
					type:"hidden"
				}]
			}
		],
		"诊断信息":[
			{
				text:"##如果您遇到功能出错，请在报告问题时附带上出错页面中的以下信息：####",
				ctrl:[
					{
						type:"hidden",
						fn:[{
							name:diagnose,
							stage:1,
						}],
					},{
						type:"br"
					},{
						id:"diagnosisInfo",
						type:"edit",
						style:"width:99%;height:230px;margin-top:5px",
						readonly:true,
					}
				],
			}
		]
	};
	// 信息和警告图片
	const infoImage="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAuUlEQVQ4y2NgoDbQ9upiiK5eznD17sv/yDi2ajlYDi9wSZ+NoREdu2bNxa7ZJnkWXHPepH1YMUzeNnU6prPRNaMDdEOU3boRBoSWLWXApxmbIRHlyxAG4LIdFx+mHqcByBifNwgagE0zWQbgig24AWFogUgIgxNW7QpEIIKiBJsr8DlfxXMSalpwTpuJPyFN2ItIjXlzsKdGx9h2gknZLqYFf37gktJmCM2dhGFQaE4/A6eYKtUzLwMAfM0C2p5qSS4AAAAASUVORK5CYII%3D";
	const warnImage="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA1ElEQVQ4y2NgoCVYz8BgsJyBwYQszUCNsv8ZGP6D8FIGBlWSDYBphmGSNC9jYNAGabqUkvL/cmYm2IAlDAympNsOA6S4YjUDgxVI8dX8fLj+6+XlYAPWsbB4kGQ7hMtAvCvWsrN7gxRdq6jAMOBWSwvYgE1sbJFE+x3FBUiuaGBgYMKp+Xpz839c4P7UqWA1QJfmomgGmYgR8thcgOSKmQwMrBi23+js/E8IPJ47FyNAudBTHbEY7gJjBgbdDgaG7k4GhqmEcDcDw2Qg7ogA5hWq5FgAlMwfVWL5pDoAAAAASUVORK5CYII%3D";
	// 显示tooltip，替代title
	const showTooltip=function(evt) {
		var tip=$alloc("optionsMenu_tooltip");
		var rect=evt.target.getBoundingClientRect();
		tip.w=$node("div").style({maxWidth:"300px",background:"#FFFFBF",border:"1px solid #CFCF3D",position:"fixed",zIndex:"200001",padding:"6px 8px 6px 8px",fontSize:"13px",left:(rect.right+3)+"px","top":(rect.bottom+3)+"px"});
		var text=evt.target.getAttribute("tooltip").split("\n");
		for(var i=0;i<text.length;i++) {
			$node("div").text(text[i]).appendTo(tip.w);
		}
		tip.w.appendTo(document.documentElement)
	};
	const hideTooltip=function(evt) {
		$alloc("optionsMenu_tooltip").w.remove();
		$dealloc("optionsMenu_tooltip");
	};

	// 函数执行队列。对应4个优先级，每一个优先级数组中的函数对象为{name:函数,args:函数参数,[trigger:{CSS选择器:事件名,...}]}
	var fnQueue=[[],[],[],[]];
	// 本地触发器队列
	var localTriggers=[];

	var categoryHTML="";
	var categoryPages=[];
	// 解析选项
	for(var category in optionMenu) {
		// 添加分类
		categoryHTML+="<li><span>"+category+"</span></li>";
		var page=$node("div");
		for(var iFunc=0;iFunc<optionMenu[category].length;iFunc++) {
			var o=optionMenu[category][iFunc];
			// 不适用于当前浏览器
			if(o.agent && (o.agent & MEM.agent)==0) {
				continue;
			}
			// 不执行函数，仅生成选项
			var noexec=false;
			// 检查执行功能页面限制
			if(o.page) {
				var p=o.page.split(",");
				noexec=true;
				for(var iPage=0;iPage<p.length;iPage++) {
					// 不适用于当前页面
					if($page(p[iPage])==true) {
						noexec=false;
						break;
					}
				}
			}
			// 检查登录限制
			if(o.login && MEM.userId=="0") {
				noexec=true;
			}
			// 放在一块中
			var block=$node("div");
			if(!o.id) {
				// 功能
				var text=o.text.split("##");
				for(var iText=0;iText<text.length;iText++) {
					// 文本节点
					if(text[iText]) {
						// 寻找前一个check作为关联目标
						var forCheck="";
						for(var iCtrl=iText-1;iCtrl>=0;iCtrl--) {
							if(o.ctrl[iCtrl].type=="br") {
								break;
							}
							if(!o.ctrl[iCtrl].type || o.ctrl[iCtrl].type=="check") {
								forCheck=o.ctrl[iCtrl].id;
								break;
							}
						}
						$node("label").attr("for",forCheck).text(text[iText]).appendTo(block);
					}
					// 控件节点
					var control=o.ctrl[iText];
					// split分割的文本节点总比控件节点多1。
					if(!control) {
						continue;
					}
					// 如果控件值已保存，用保存的值替代默认值
					if(control.id && savedOptions[control.id]!=null && !control.readonly) {
						control.value=savedOptions[control.id];
					}
					// 生成控件节点
					var node=null;
					switch(control.type || "check") {
						case "check":
							node=$node("input").attr("type","checkbox");
							break;
						case "hidden":
							break;
						case "input":
							node=$node("input");
							break;
						case "info":
							node=$node("input").attr({type:"image",src:infoImage,tooltip:control.value,tabIndex:-1});
							node.hook("mouseover",showTooltip).hook("mouseout",hideTooltip);
							control.value=null;
							break;
						case "warn":
							node=$node("input").attr({type:"image",src:warnImage,tooltip:control.value,tabIndex:-1});
							node.hook("mouseover",showTooltip).hook("mouseout",hideTooltip);
							control.value=null;
							break;
						case "br":
							node=$node("div");
							break;
						case "edit":
							node=$node("textarea");
							break;
						case "button":
							node=$node("button");
							break;
						case "label":
							node=$node("span");
							break;
						case "link":
							node=$node("a");
							break;
					}
					if(node) {
						if(control.value!=null) {
							switch(control.format) {
								case "date":
									node.value($formatDate(control.value));
									break;
								default:
									node.value(control.value);
									break;
							}
						}
						if(control.id) {
							node.attr("id",control.id);
						}
						if(control.style) {
							node.attr("style",control.style);
						}
						if(control.attr) {
							node.attr(control.attr);
						}
						if(control.readonly) {
							node.attr("readonly","true");
							control.value=null;
						}
						if(control.format) {
							node.attr("fmt",control.format);
						}
						// 输入验证
						if(control.verify) {
							node.attr("verify",JSON.stringify(control.verify));
						}
						node.appendTo(block);
					}
					if(control.value!=null && control.id!=null) {
						MEM.options[control.id]=control.value;
					}

					// 相关函数
					if(!noexec && control.fn) {
						for(var iFn=0;iFn<control.fn.length;iFn++) {
							var fn=control.fn[iFn];
							// 没有设置参数的话，设置一个空的参数集，方便后面处理
							if(!fn.args) {
								fn.args=[];
							}
							if(fn.fire==null || (typeof fn.fire=="boolean" && node.value()==fn.fire)) {
								// 符合要求，放入执行序列
								fnQueue[fn.stage].push({name:fn.name,args:fn.args});
							} else if(fn.fire==="trigger" && node.value()) {
								// 只在trigger指定的事件触发时执行
							} else if(typeof fn.fire=="string" && fn.fire!="trigger") {
								// 参数中可能有本地参数@xxxx，需要转换。
								localTriggers.push({fn:fn,target:node});
							} else {
								continue;
							}
							// 其他节点触发事件
							if(fn.trigger) {
								// 只有等到DOM建立后页面节点才能保证可访问。所以优先级最小为1
								fnQueue[(fn.stage==0?1:fn.stage)].push({name:fn.name,args:fn.args,trigger:fn.trigger});
							}
						}
					}
				}
			} else {
				// 选项组
				if(o.text) {
					var node=$node("div").text(o.text).appendTo(block);
					if(o.info) {
						$node("input").attr({type:"image",src:infoImage,tooltip:o.info,tabIndex:-1}).hook("mouseover",showTooltip).hook("mouseout",hideTooltip).appendTo(node);
					}
					if(o.warn) {
						$node("input").attr({type:"image",src:warnImage,tooltip:o.info,tabIndex:-1}).hook("mouseover",showTooltip).hook("mouseout",hideTooltip).appendTo(node);
					}
				}
				var group={};
				var table=$node("tbody").appendTo($node("table").attr("class","group").appendTo(block));
				for(var i=0;i<o.ctrl.length;) {
					var tr=$node("tr").appendTo(table);
					for(var j=0;j<o.column;j++,i++) {
						var item=o.ctrl[i];
						var td=$node("td").appendTo(tr);
						if(i<o.ctrl.length) {
							// 如果控件值已保存，用保存的值替代默认值
							if(o.id && savedOptions[o.id]!=null && savedOptions[o.id][item.id]!=null) {
								item.value=savedOptions[o.id][item.id];
							}
							var text=item.text.split("##");
							if(text[0]) {
								$node("label").attr("for",o.id+"_"+item.id).text(text[0]).appendTo(td);
							}
							// 生成控件节点
							var node=null;
							switch(item.type || "check") {
								case "check":
									node=$node("input").attr("type","checkbox");
									break;
								case "hidden":
									break;
								case "input":
									node=$node("input");
									break;
								case "edit":
									node=$node("textarea");
									break;
								case "button":
									node=$node("button");
									break;
								case "label":
									node=$node("span");
									break;
							}
							if(node) {
								node.value(item.value);
								node.attr({id:o.id+"_"+item.id,style:(item.style || "")});
								node.appendTo(td);
								// 输入验证
								if(item.verify) {
									node.attr("verify",JSON.stringify(control.verify));
								}
							}
							if(item.value!=null) {
								group[item.id]=item.value;
							}
							if(text[1]) {
								$node("label").attr("for",o.id+"_"+item.id).text(text[1]).appendTo(td);
							}
						}
					}
				}
				MEM.options[o.id]=group;
			}
			// 为主控件（仅明确指定的）添加值切换相应事件
			if(o.master!=null) {
				// block下只有一层，滤掉所有的label就是所有控件，选出对应序号的即可
				var target=block.find("*:not(label)").pick(o.master);
				// 做个标记，用在点击选项菜单取消按钮重置选项时
				target.attr("master","true");
				$master(target);
				// 主控件值改变只可能checkbox/input/textarea三种。click和keyup足够应付
				target.hook("click,keyup",function(evt) {
					$master($(evt.target));
				});
			}

			if(block.heirs()!=0) {
				page.append(block);
			}
		}
		// 将生成的页面div放入optionPages数组，方便后面加入到菜单
		categoryPages.push(page.style("display","none").get());
	}

	// 检查执行队列中的参数，如果是@开头就替换成对应选项值
	for(var iStage=0;iStage<4;iStage++) {
		for(var i=0;i<fnQueue[iStage].length;i++) {
			var fn=fnQueue[iStage][i];
			if(!fn.args) {
				continue;
			}
			for(var iArg=0;iArg<fn.args.length;iArg++) {
				if(typeof fn.args[iArg]=="string" && fn.args[iArg].charAt(0)=="@") {
					fn.args[iArg]=MEM.options[fn.args[iArg].substring(1)];
				}
			}
		}
	}

	// 执行优先级为0的函数
	for(var i=0;i<fnQueue[0].length;i++) {
		var fn=fnQueue[0][i];
		try {
			fn.name.apply(null,fn.args);
		} catch(ex) {
			$error(fn.name,ex);
		}
	}

	// 设置本地触发
	for(var i=0;i<localTriggers.length;i++) {
		var t=localTriggers[i];
		var fn=t.fn;
		// fn.args[0]将会被事件对象占用，从1开始检查
		for(var iArg=1;iArg<fn.args.length;iArg++) {
			if(typeof fn.args[iArg]=="string" && fn.args[iArg].charAt(0)=="@") {
				fn.args[iArg]=MEM.options[fn.args[iArg].substring(1)];
			}
		}
		// 将fn包在一个匿名函数中确保事件触发时能得到对应的fn
		(function(func) {
			t.target.hook(func.fire,function(evt) {
				func.args[0]=evt;
				func.name.apply(null,func.args);
			});
		})(fn);
	}

	// 支持环境的图标

	// 生成选项菜单
	var menuHTML='<style type="text/css">.mem_op{width:500px;position:fixed;z-index:200000;color:black;blackground:black;font-size:12px}.mem_op *{padding:0;margin:0;border-collapse:collapse;line-height:normal}.mem_op a{color:#3B5990}.mem_op table{width:100%;table-layout:fixed}.mem_op .tl{border-top-left-radius:8px;-moz-border-radius-topleft:8px}.mem_op .tr{border-top-right-radius:8px;-moz-border-radius-topright:8px}.mem_op .bl{border-bottom-left-radius:8px;-moz-border-radius-bottomleft:8px}.mem_op .br{border-bottom-right-radius:8px;-moz-border-radius-bottomright:8px}.mem_op .border{height:10px;overflow:hidden;width:10px;background-color:black;opacity:0.5}.mem_op .m{width:100%}.mem_op .title {padding:4px;display:block;background:#3B5998;color:white;text-align:center;font-size:12px;-moz-user-select:none;-khtml-user-select:none;cursor:default}.mem_op .btns{background:#F0F5F8;text-align:right}.mem_op .btns>input{border-style:solid;border-width:1px;padding:2px 15px;margin:3px;font-size:13px}.mem_op .ok{background:#5C75AA;color:white;border-color:#B8D4E8 #124680 #124680 #B8D4E8}.mem_op .cancel{background:#F0F0F0;border-color:#FFFFFF #848484 #848484 #FFFFFF;color:black}.mem_op>table table{background:#FFFFF4}.mem_op .options>table{height:280px;border-spacing:0}.mem_op .c td{vertical-align:top}.mem_op .category{width:119px;min-width:119px;border-right:1px solid #5C75AA}.mem_op li{list-style-type:none}.mem_op .category li{cursor:pointer;height:30px;overflow:hidden}.mem_op .category>div{overflow-x:hidden;overflow-y:auto;height:300px}.mem_op .category li:hover{background:#ffffcc;color:black}.mem_op li:nth-child(2n){background:#EEEEEE}.mem_op li.selected{background:#748AC4;color:white}.mem_op .category span{left:10px;position:relative;font-size:14px;line-height:30px}.mem_op .pages>div{overflow:auto;height:280px;padding:10px}.mem_op .pages>div>div{min-height:19px}.mem_op .pages>div>*{padding:2px 0;width:100%}.mem_op table.group{margin-left:5px;margin-top:3px}.mem_op .group td{padding:2px 0}.mem_op input[type="checkbox"]{margin-right:4px;vertical-align:middle}.mem_op button{background:#FDFCFB;background:-moz-linear-gradient(top,#FDFCFB,#E7E2DB);background:-webkit-gradient(linear,0 0,0 100%,from(#FDFCFB),to(#E7E2DB));color:black;border-color:#877C6C #A99D8C #A99D8C;border-width:1px;border-style:solid;-moz-border-radius:3px;border-radius:3px;font-size:12px;padding:1px}.mem_op button:active{background:#DAD3C8;background:-moz-linear-gradient(top,#DAD3C8,#CCC4B9);background:-webkit-gradient(linear,0 0,0 100%,from(#DAD3C8),to(#CCC4B9))}.mem_op label{color:black;font-weight:normal;cursor:pointer}.mem_op label[for=""]{cursor:default}.mem_op input[type="image"]{margin-left:2px;margin-right:2px}.mem_op input:not([type]){border-width:1px;border-style:solid;-moz-border-radius:3px;border-radius:3px;padding:1px;border-color:#877C6C #A99D8C #A99D8C}.mem_op input:not([type]):focus{border-color:#3A6389}.mem_op textarea{resize:none;-moz-resize:none}.mem_op .pages .default{text-align:center}.mem_op .pages .default table{height:95%}.mem_op .pages .default td{vertical-align:middle}.mem_op .pages .default td>*{padding:5px}.mem_op .default .icons>a{margin:10px}</style>';
	menuHTML+='<table><tbody><tr><td class="border tl"></td><td class="border m"></td><td class="border tr"></td></tr><tr><td class="border"></td><td class="c m"><div class="title">MeMemo 选项</div><div class="options"><table><tbody><tr><td class="category"><div><ul>'+categoryHTML+'</ul></div></td><td class="pages"><div class="default"><table><tbody><tr><td><h1>MeMemo</h1><p><b>'+MEM.version+' ('+MEM.miniver+')</b></p><p><b>Copyright © 2010</b></p><p><a href="mailto:pro711+mememo@gmail.com">pro711+mememo@gmail.com</a></p><p><a href="http://mememo.googlecode.com/" target="_blank">项目主页</a></p></td></tr></tbody></table></div></td></tr></tbody></table></div><div class="btns"><input type="button" value="确定" class="ok"/><input type="button" value="取消" class="cancel"/></div></td><td class="border"></td></tr><tr><td class="border bl"></td><td class="border m"></td><td class="border br"></td></tr></tbody></table>';

	var menu=$node("div").attr("class","mem_op").style("display","none").code(menuHTML).appendTo(document.documentElement);
	menu.find("td.pages").append($(categoryPages));

	// 点击分类切换事件
	menu.find(".category ul").hook("click",function(evt) {
		var t=$(evt.target);
		if(t.prop("tagName")=="SPAN") {
			t=t.superior();
		}
		menu.find(".pages>div").hide();
		menu.find(".pages>div").pick(t.index()+1).show();
		menu.find(".category li.selected").removeClass("selected");
		t.addClass("selected");
	});

	// 点击取消按钮事件
	menu.find(".cancel").hook("click",function(evt) {
		menu.hide();
		// 重置选项
		for(var op in MEM.options) {
			if(typeof MEM.options[op]=="object") {
				// 选项组
				var group=MEM.options[op];
				for(var item in group) {
					var c=menu.find("#"+item);
					if(c.empty()) {
						continue;
					} else {
						c.value(group[item]);
					}
				}
			} else { 
				var c=menu.find("#"+op);
				if(c.empty()) {
					continue;
				} else {
					switch(c.attr("fmt")) {
						case "date":
							c.value($formatDate(MEM.options[op]));
							break;
						default:
							c.value(MEM.options[op]);
							break;
					}
				}
				// 主控件还要重置禁用效果
				if(c.attr("master")) {
					$master(c);
				}
			}
		}
	});

	// 点击保存按钮事件
	menu.find(".ok").hook("click",function(evt) {
		// 先进行验证
		var pass=true;
		menu.find("*[verify]:not([disabled])").each(function(elem) {
			var node=$(elem);
			var rules=JSON.parse(node.attr("verify"));
			for(var rule in rules) {
				if(!node.value().match(new RegExp(rule))) {
					// 转到对应的页面
					var page=node;
					while(page.superior().prop("className")!="pages") {
						page=page.superior();
					}
					var index=page.index()
					menu.find(".pages>div").hide().pick(index).show();
					menu.find(".category li").removeClass("selected").pick(index-1).addClass("selected");

					alert(rules[rule]);
					elem.focus();
					pass=false;
					return false;
				}
			}
		});
		if(!pass) {
			return;
		}

		for(var op in MEM.options) {
			if(typeof MEM.options[op]=="object") {
				// 选项组
				var group=MEM.options[op];
				var changed=false;
				for(var item in group) {
					var c=menu.find("#"+op+"_"+item);
					if(c.empty()) {
						continue;
					} else {
						var newValue=c.value();
						if(group[item]!=newValue) {
							changed=true;
							group[item]=newValue;
						}
					}
				}
				if(changed) {
					$save(op,group);
				}
			} else {
				var c=menu.find("#"+op);
				if(c.empty()) {
					continue;
				} else {
					var newValue=c.value();
					// 只保存修改了的
					if(MEM.options[op]!=newValue) {
						$save(op,newValue);
					}
				}
			}
		}
		document.location.reload();
	});

	// 菜单在导航栏上的入口
	var entry=$node("div").attr("class","menu").append($node("div").attr("class","menu-title").append($node("a").attr({href:"javascript:;",onclick:"return false;"}).text("MeMemo")));
	entry.find("a").hook("click",function() {
		menu.show().style({"top":parseInt(window.innerHeight-menu.prop("offsetHeight"))/2+"px","left":parseInt(window.innerWidth-menu.prop("offsetWidth"))/2+"px"});
	});

	// 执行剩下三个优先级的函数
	for(var p=1;p<=3;p++) {
		$wait(p,function (stage) {
			if(stage==2) {
				// 添加菜单入口项在页面DOM构建完毕后执行
				entry.prependTo($(".nav-body .nav-other"));
			}

			for(var i=0;i<fnQueue[stage].length;i++) {
				var fn=fnQueue[stage][i];
				if(fn.trigger) {
					// 触发器
					for(var t in fn.trigger) {
						// 将fn包在一个匿名函数中确保事件触发时能得到对应的fn
						(function(func) {
							$(t).hook(func.trigger[t],function(evt) {	
								try {
									func.args[0]=evt;
									func.name.apply(null,func.args);
								} catch(ex) {
									$error(func.name,ex);
								}
							});
						})(fn);
					}
				} else {
					// 一般功能
					try {
						fn.name.apply(null,fn.args);
					} catch(ex) {
						$error(fn.name,ex);
					}
				}
			}
		});
	}
};


/* 以下是基本辅助函数，所有函数以$开头 */

/*
 * 读取cookie
 * 参数
 *   [String]name:cookie名
 *   [String]def:当name不存在时的返回值，默认为""
 * 返回值
 *   [String]cookie值
 */
function $cookie(name,def) {
	var cookies=document.cookie.split(';');
	name=escape(name);
	for(var i=0;i<cookies.length;i++) {
		var c=cookies[i].replace(/^ +/g,"");
		if(c.indexOf(name+"=")==0) {
			return unescape(c.substring(name.length+1,c.length));
		}
	}
	return def || "";
};

/*
 * 创建一个DOM节点
 * 参数
 *   [String]tag:节点的tagName，如果为空，则创建纯文本节点
 * 返回值
 *   [PageKit]节点对象
 */
function $node(name) {
	if(!name) {
		return PageKit(document.createTextNode(""));
	} else {
		return PageKit(document.createElement(name));
	}
};

/*
 * 判断URL是否属于某一类页面
 * 参数
 *   [String]category:页面类别，可能的值参考函数内pages常量
 *   [String]url:默认为当前页面地址
 * 返回值
 *   [Boolean]:属于返回true，否则false。如果category非法，返回true。
 */
function $page(category,url) {
	const pages={
		home:"renren\\.com/[hH]ome|/guide\\.renren\\.com/[Gg]uidexf",	// 首页，后面的是新注册用户的首页
		profile:"renren\\.com/[Pp]rofile|renren\\.com/$|/renren\\.com/\\?|/www\\.renren\\.com/\\?|/[a-zA-Z0-9_]{5,}\\.renren.com/\\?id=|/[a-zA-Z0-9_]{5,}\\.renren.com/\\?.*&id=|renren.com/[a-zA-Z0-9_]{4,20}$", // 个人主页，最后一个是个人网址。http://safe.renren.com/personalLink.do
		blog:"/blog\\.renren\\.com/",	// 日志
		club:"/club\\.renren\\.com/",	// 论坛
		pages:"/page\\.renren\\.com/",	// 公共主页
		status:"/status\\.renren\\.com/",	// 状态
		photo:"/photo\\.renren\\.com/|/page\\.renren\\.com/[^/]+/photo/",	// 照片
		album:"photo\\.renren\\.com/getalbum|photo\\.renren\\.com/.*/album-[0-9]+|page\\.renren\\.com/.*/album|/photo/album\\?|photo\\.renren\\.com/photo/ap/",	// 相册
		friend:"/friend\\.renren\\.com/",	// 好友
		share:"/share\\.renren\\.com/",	// 分享
		act:"/act\\.renren\\.com/",	// 活动
		request:"/req\\.renren\\.com/",	// 请求
		searchEx:"/browse\\.renren\\.com/searchEx\\.do"	//搜索结果
	};
	if(!url) {
		url=MEM.url;
	}
	// 把锚点去掉
	url=url.replace(/#[\s\S]*$/,"");

	return pages[category]==null || url.match(pages[category])!=null;
};

/*
 * 申请一个全局对象
 * 参数
 *   [String]name:对象名称，如果同名对象已经被分配，则返回那个对象
 *   [Any]value:预设对象值。可空。仅当同名对象未被分配时有效
 * 返回值
 *   [Object]:对象
 */
function $alloc(name,value) {
	if(MEM.storage[name]) {
		return MEM.storage[name];
	} else {
		if(value==null) {
	 		MEM.storage[name]=new Object();
		} else {
	 		MEM.storage[name]=value;
		}
		return MEM.storage[name];
	}
};

/*
 * 判断是否已经分配了同名对象
 * 参数
 *   [String]name:对象名称，可以为空
 * 返回值
 *   [Boolean]:是否已经分配
 */
function $allocated(name) {
	return MEM.storage[name]!=null;
};


/*
 * 解除全局对象分配
 * 参数
 *   [String]name:对象名称
 * 返回值
 *   无
 */
function $dealloc(name) {
	MEM.storage[name]=null;
};

/*
 * 弹出提示窗口
 * 参数
 *   [String]title:窗口标题
 *   [String]content:内容，HTML代码
 *   [String]geometry:位置尺寸。标准X表示法，宽x高+x+y，高是自动计算，忽略输入值。默认200x0+5-5
 *   [Number]stayTime:停留时间，以秒计算
 *   [Nember]popSpeed:弹出速度，以像素计算。为每timeout毫秒弹出的高度
 * 返回值
 *   [PageKit]:弹出窗口
 */
function $popup(title,content,geometry,stayTime,popSpeed) {
	const timeout=50;
	var node=$node("div").style({position:"fixed",backgroundColor:"#F0F5F8",border:"1px solid #B8D4E8",zIndex:100000,overflow:"hidden"});

	var geo=/^(\d+)x\d+([+-]?)(\d*)([+-]?)(\d*)$/.exec(geometry);
	if(!geo) {
		geo=["","200","+","5","-","5"];
	}
	node.style("width",(geo[1]=="0"?"auto":geo[1]+"px")).style((geo[2] || "+")=="+"?"left":"right",(geo[3] || "0")+"px").style((geo[4] || "-")=="+"?"top":"bottom",(geo[5] || "0")+"px");
	var closeLink=$node("a").style({cssFloat:"right",fontSize:"x-small",color:"white",cursor:"pointer"}).text("关闭").hook("click",function() {
		node.remove();
	});
	node.append($node("div").text((title || "提示")).append(closeLink).style({background:"#526EA6",color:"white",fontWeight:"bold",fontSize:"normal",padding:"3px"}));
	node.append($node("div").style("margin","5px").code(content)).appendTo(document.body);

	var maxHeight=parseInt(node.prop("clientHeight"));
	node.style("height","0px");
	// 展开
	setTimeout(function () {
		try {
			var h=parseInt(node.style("height"));
			if(h<maxHeight) {
				var diff=maxHeight-h;
				node.style("height",(h+(diff>popSpeed?popSpeed:diff))+"px");
				setTimeout(arguments.callee,timeout);
			} else {
				// 收起
				setTimeout(function () {
					try {
						var h=parseInt(node.style("height"));
						if(h<=0) {
							node.remove();
						} else {
							node.style("height",(h>popSpeed?h-popSpeed:0)+"px");
							setTimeout(arguments.callee,timeout);
						}
					} catch(ex) {
					}
				},stayTime*1000);
				closeLink.text("关闭("+stayTime+")");
				var timer=setInterval(function() {
					if(!node || stayTime<=0) {
						clearInterval(timer);
					} else {
						stayTime--;
						closeLink.text("关闭("+stayTime+")");
					}
				},1000);
			}
		} catch(ex) {
		}
	},timeout);
	return node;
};

/*
 * 尽量在特定的时机执行
 * 参数
 *   [Number]stage：目标时机。0：DOM创建前。1&2：DOM创建后（DOMContentLoaded）。3：页面加载完毕后（load）
 *   [Function]func：执行的函数，执行时将被传入优先级作为参数
 * 返回值
 *   无
 */
function $wait(stage,func) {
	/*
	 * 页面加载阶段测试：test3.html
	 * Firefox 3.6.3/3.7a6pre：loading -> interactive -> completed
	 * Chromium 6.0.411.0 (47760)：loading -> loaded -> completed
	 * Safari 5 (7533.16)：loading -> loaded -> completed
	 * Opera 10.54：interactive -> interactive/completed -> completed
	 * 目前不支持Opera。
	 */
	var curStage=3;
	switch(document.readyState) {
		case "loading":
			curStage=0;
			break;
		case "loaded":
		case "interactive":
			if(stage==1 || stage==2) {
				curStage=stage;
			} else {
				curStage=2;
			}
			break;
	}
	if(stage>curStage) {
		// stage>curStage>=0 -> stage>0
		if(stage<3) {
			document.addEventListener("DOMContentLoaded",function() {
				func(stage);
			},false);
		} else {
			window.addEventListener("load",function() {
				func(stage);
			},false);
		}
	} else {
		// 已经错过了/正赶上，立即执行
		func(stage);
	}
};


/*
 * 在浏览器中执行脚本
 * 参数
 *   [String]code:脚本内容
 * 返回值
 *   无
 */
function $script(code) {
	if(!code){
		return;
	}
	// 让脚本以匿名函数方式执行
	if(!/^\(function/.test(code)) {
		code="(function(){try{"+code+"}catch(ex){}})();";
	}
	if(MEM.agent==CHROME || MEM.agent==SAFARI) {
		// 如果chrome/safari用location方法，会发生各种各样奇怪的事。比如innerHTML失灵。。。万恶的webkit
		$node("script").text(code).appendTo(document.documentElement);
	} else {
		document.location.href="javascript:"+code;
	}
};

/*
 * 改变页面样式
 * 参数
 *   [String]style:CSS语句
 * 返回值
 *   [PageKit]:创建的style节点
 */
function $patchCSS(style) {
	return $node("style").attr("type","text/css").text(style).appendTo(document.documentElement);
};

/*
 * 删除对象，并禁止显示
 * 参数
 *   [String]style:CSS选择语句
 * 返回值
 *   无
 */
function $ban(style) {
	$patchCSS(style+"{display:none !important}");
	$wait(1,function() {
		$(style).remove();
	});
};

/*
 * 保存选项。实际是保存MEM.options
 * 参数
 *   [String]name:选项名或选项值集合
 *   [String/Number/Boolean]value:值
 * 返回值
 *   无
 */
function $save(name,value) {
	MEM.options[name]=value;
	var opts=JSON.stringify(MEM.options);
	switch(MEM.agent) {
		case USERSCRIPT:
			GM_setValue("mem_options",opts);
			break;
		case FIREFOX:
			extServices("save",escape(opts));
			break;
		case CHROME:
			chrome.extension.sendRequest({action:"save",data:opts});
			break;
		case SAFARI:
			safari.self.tab.dispatchMessage("mem_save",opts);
			break;
	}
};

/*
 * 发送HTTP请求。支持跨域。Chrome/Safari跨域还需要配置权限。
 * 参数
 *   [String]url:页面地址
 *   [Function]func:回调函数。function(pageText,url,data){}。如果发生错误，pageText为null
 *   [Any]userData:额外的用户数据。可选。
 *   [String]method:请求方法。可选，默认为GET。
 * 返回值
 *   无
 */
function $get(url,func,userData,method) {
	if(!method) {
		method="GET";
	}
	switch(MEM.agent) {
		case FIREFOX:
			// 如果直接使用window.XMLHttpRequest，即使在创建sandbox时赋予chrome的window权限，也会被noscript阻挡。
			// 是该赞叹noscript尽职呢还是怪它管的太宽呢…
			extServices("get",{url:url,func:func,data:userData,method:method});
			break;
		case USERSCRIPT:
			if(func!=null) {
				GM_xmlhttpRequest({method:method,url:url,onload:function(o) {
					func((o.status==200?o.responseText:null),url,userData);
				},onerror:function(o) {
					func(null,url,userData);
				}});
			} else {
				GM_xmlhttpRequest({method:method,url:url});
			}
			break;
		case CHROME:
			if(func==null) {
				chrome.extension.sendRequest({action:"get",url:url,method:method});
			} else {
				chrome.extension.sendRequest({action:"get",url:url,method:method},function(response) {
					func(response.data,url,userData);
				});
			}
			break;
		case SAFARI:
			// 由于发送和接收消息是分离的，随机ID确保联系
			var requestId=Math.random();
			if(func!=null) {
				safari.self.addEventListener("message",function(msg) {
					if(msg.name=="mem_get_data" && msg.message.id==requestId) {
						safari.self.removeEventListener("message",arguments.callee,false);
						func(msg.message.data,url,userData);
					}
				},false);
			}
	    	safari.self.tab.dispatchMessage("mem_get",{id:requestId,url:url,method:method});
			break;
	} 
};

/*
 * 记录错误信息
 * 参数
 *   [String/Function]func:发生错误的函数(名)
 *   [Error]error:异常对象
 * 返回值
 *   无
 */
function $error(func,error) {
	if(typeof func=="function") {
		func=/function (.*?)\(/.exec(func.toString())[1];
	}
	if(typeof error=="object" && error.name && error.message) {
		var msg="在 "+func+"() 中发生了一个错误。\n错误名称："+error.name+"\n错误信息："+error.message+"\n\n";
		if(MEM.agent==FIREFOX) {
			extServices("log",msg);
		} else {
			console.log(msg);
		}
		var board=$(".mem_op #diagnosisInfo");
		if(!board.empty()) {
			board.value(board.value()+msg);
		}
	}
};

/*
 * 主控件值改变时的连带禁用效果
 * 参数
 *   [PageKit]master:主控件对象
 * 返回值
 *   无
 */
function $master(master) {
	var p=master.superior();
	if(!master.value()) {
		// 写"*:not(#"+id+")"也可以。但为防止master忘了设置ID。。。
		p.find("*:not([id='"+master.attr("id")+"'])").prop("disabled",true);
		// warn和info不禁用
		p.find("input[type='image']").prop("disabled",false);
	} else {
		p.find("*").prop("disabled",false);
	}
};

/*
 * 判断新鲜事类型，feed为li经MEM包装
 * 参数
 *   [Node]feed:新鲜事li节点
 * 返回值
 *   [String]:新鲜事类型文本。无符合的返回""
 */
function $feedType(feed) {
	var types={
		// 标题文本，标题HTML，有无content，footerHTML
		"share":	["^分享"],
		"status":	["^:",null,false],	// 如果是纯表情状态，:后面的空格会被去除
		"blog":		["^发表日志"],
		"photo":	["^上传了\\d+张照片至|^的照片|美化了一张照片$|^:",null,true],
		"contact":	["^你和.*和好朋友保持联络$"],
		"profile":	["^修改了头像"],
		"app":		[null,"<a [^>]*href=\"http://apps?.renren.com/"],
		"gift":		["^收到","<a [^>]*href=\"http://gift.renren.com/"],
		"tag":		["照片中被圈出来了$"],
		"movie":	[null,"<a [^>]*href=\"http://movie.xiaonei.com/|<a [^>]*href=\"http://movie.renren.com/"],
		"connect":	[null,null,null,"<a [^>]*href=\"http://www.connect.renren.com/"],
		"friend":	["^和[\\s\\S]+成为了好友。|^、[\\s\\S]+和[\\s\\S]+成为了好友。"],
		"page":		[null,"<a [^>]*href=\"http://page.renren.com/"],
		"vip":		["^更换了主页模板皮肤|^更换了主页装扮|^成为了人人网[\\d\\D]*VIP会员特权|^收到好友赠送的[\\d\\D]*VIP会员特权|^开启了人人网VIP个性域名"],
		"music":	["^上传了音乐"],
		"poll":		[null,"<a [^>]*href=\"http://abc.renren.com/"],
		"group":	[null,"<a [^>]*href=\"http://group.renren.com/"],
		"levelup":	["^等级升至"],
	};

	var feedTitle=feed.find("h3");
	// 删除所有链接子节点，只留下文本节点
	var feedTitleText=feedTitle.clone();
	feedTitleText.find("a:not(.text)").remove();

	for(i in types) {
		var type=types[i];
		var feedText=type[0];
		var feedHTML=type[1];
		var feedContent=type[2];
		var feedFooterHTML=type[3];
		if ((!feedText || new RegExp(feedText).test(feedTitleText.text().replace(/^[ \t\n\r]+|[ \t\n\r]+$/g,""))) && (!feedHTML || new RegExp(feedHTML).test(feedTitle.code())) && (feedContent==null || feed.find("div.content").empty()!=feedContent) && (!feedFooterHTML || new RegExp(feedFooterHTML).test(feed.find(".details .legend").code()))) {
			return i;
		}
	}
	return "";
};

/*
 * 格式化日期。如果不是Firefox扩展的安全限制，可以直接作为Date的方法。。。
 * 参数
 *   [Date]d:日期对象
 * 返回值
 *   [String]:yyyy-MM-dd HH:mm:ss格式的文本，出错返回“未知”
 */
function $formatDate(d) {
	if(!(d instanceof Date)) {
		if(d===0) {
			return "未知";
		} else {
			d=new Date(d);
		}
	}
	if(isNaN(d.getYear())) {
		return "未知";
	}
	var formats={
		"y+": d.getFullYear(),	// 年
		"M+": d.getMonth()+1,	// 月
		"d+": d.getDate(),		// 日
		"H+": d.getHours(),		// 时
		"m+": d.getMinutes(),	// 分
		"s+": d.getSeconds(),	// 秒
	};
	var fmt="yyyy-MM-dd HH:mm:ss";
    for(var i in formats) {
    	if(new RegExp("("+i+")").test(fmt)) {
			prefix="";
			for(var times=RegExp.$1.length-formats[i].toString().length;times>0;times--) {
				prefix+="0";
			}
	       	fmt=fmt.replace(RegExp.$1,prefix+formats[i]);
		}
	}
	return fmt;
};

/* 基本辅助函数完 */


/*
 * PageKit，用于处理DOM节点
 */
function PageKit(o) {
	if(!(this instanceof PageKit)) {
		return o?new PageKit(arguments):null;
	};
	return this.init(o);
};
PageKit.prototype={
	// 初始化
	init: function(o) {
		// 包含的DOM节点
		this.nodes=[];
		for(var i=0;i<o.length;i++) {
			var selector=o[i];
			if(typeof selector=="string") {
				// CSS选择语句
				this.nodes=this.nodes.concat(Array.prototype.slice.call(document.querySelectorAll(selector)));
			} else if(selector.nodeType) {
				// DOM节点
				this.nodes=this.nodes.concat(Array(selector));
			} else if(selector instanceof PageKit) {
				// PageKit对象
				this.nodes=this.nodes.concat(o.nodes);
			} else {
				// 其他的东西，有可能是NodeList，全部包在Array里
				this.nodes=this.nodes.concat(Array.prototype.slice.call(selector));
			}
		}
		return this;
	},
	// 遍历对象的DOM节点，参数为一回调函数，function(elem,index){}，当有返回非undefined/null值时终止遍历;
	each:function(func) {
		if(typeof func == "function") {
			for(var i=0;i<this.nodes.length;i++) {
				try {
					if(!(func(this.nodes[i],i)==null)) {
						break;
					}
				} catch(ex) {
					$error("PageKit::each",ex);
				}
			}
		}
		return this;
	},
	// 获取对象中的DOM节点，如果index为-1取最后一个，默认为第一个
	get:function(index) {
		try {
			if(index==null) {
				index=0;
			} else if(index==-1) {
				index=this.nodes.length-1;
			}
			return this.nodes[index];
		} catch(ex) {
			return null;
		}
	},
	// 获取对象中某一个DOM节点，经PageKit包装，如果index为-1取最后一个，默认为第一个
	pick:function(index) {
		return PageKit(this.get(index));
	},
	// 删除对象所有的DOM节点。如果safe为true，只有当其无子节点时才删除
	remove:function(safe) {
		this.each(function(elem) {
			if(!safe || elem.childElementCount==0) {
				elem.parentNode.removeChild(elem);
			}
		});
		this.nodes=[];
		return this;
	},
	// 删除对象所有DOM节点。如果safe为true，只有当其无子节点时才删除，如果删除后父节点无其他子节点，一并删除
	purge:function(safe) {
		this.each(function(elem) {
			if(!safe || elem.childElementCount==0) {
				var p=elem.parentNode;
				p.removeChild(elem);
				while (p.childElementCount==0) {
					var q=p.parentNode;
					q.removeChild(p);
					p=q;
				}
			}
		});
		this.nodes=[];
		return this;
	},
	// 隐藏对象所有的DOM节点
	hide:function() {
		this.each(function(elem) {
			elem.style.display="none";
		});
		return this;
	},
	// 显示对象所有的DOM节点
	show:function() {
		this.each(function(elem) {
			elem.style.display=null;
			elem.style.visibility=null;
		});
		return this;
	},
	// 获取/设置对象节点的TagName。设置时原节点将被废弃
	tag:function(v) {
		if(!v) {
			// 读取
			return this.get().tagName || "";
		} else {
			// 设置
			if(typeof v=="string") {
				v=document.createElement(v);
			} else if(v instanceof PageKit) {
				v=v.get();
			}
			if(v.nodeType) {
				var mem=this;
				this.each(function(elem,index) {
					var newNode=v.cloneNode(false);
					while(elem.childNodes.length>0) {
						newNode.appendChild(elem.childNodes[0]);
					}
					elem.parentNode.replaceChild(newNode,elem);
					mem.nodes[index]=newNode;
				});
			}
			return this;
		}
	},
	// 获取对象中的DOM节点数量
	size:function() {
		return this.nodes.length;
	},
	// 获取对象中的DOM节点数量是否为空
	empty:function() {
		return this.nodes.length==0;
	},
	// 获取对象某个DOM节点的子节点数
	heirs:function(index) {
		try {
			return this.get(index).childElementCount;
		} catch(ex) {
			return 0;
		}
	},
	// 获取对象第一个DOM节点在其兄弟节点中的序号，从0开始
	index:function() {
		try {
			var node=this.get().previousElementSibling;
			var c=0;
			for(;node!=null;node=node.previousElementSibling) {
				c++;
			}
			return c;
		} catch(ex) {
			return 0;
		}
	},
	// 获取对象第一个DOM节点的某个子节点，index为-1时取最后一个。经PageKit包装
	child:function(index) {
		try {
			var node=this.get();
			return $(node.children[index!=-1?index:node.childElementCount-1]);
		} catch(ex) {
			return null;
		}
	},
	// 获取对象第一个DOM节点的上级节点(经PageKit对象包装)。通过level指定向上几层
	superior:function(level) {
		try {
			if(!level) {
				level=1;
			}
			if(level<=0) {
				return this;
			}
			var s=this.get();
			for(;level>0;level--) {
				s=s.parentNode;
			}
			return PageKit(s);
		} catch(ex) {
			return null;
		}
	},
	// 获取对象第一个DOM节点的上一个相邻节点(经PageKit对象包装)
	previous:function() {
		try {
			return PageKit(this.get().previousElementSibling);
		} catch(ex) {
			return null;
		}
	},
	// 获取对象第一个DOM节点的下一个相邻节点(经PageKit对象包装)
	next:function() {
		try {
			return PageKit(this.get().nextElementSibling);
		} catch(ex) {
			return null;
		}
	},
	// 追加子节点
	append:function(o) {
		var node=this.get();
		if(!node) {
			return this;
		} else if(node.nodeType==1) {
			if(o instanceof PageKit) {
				o.each(function(elem) {
					node.appendChild(elem);
				});
			} else if(o.nodeType==1){
				node.appendChild(o);
			} else if(typeof o=="string") {
				node.innerHTML+=o;
			}
		}
		return this;
	},
	// 插入子节点到对象的pos位置
	insert:function(o,pos) {
		var node=this.get();
		var xhr=this;
		if(!node) {
			return this;
		} else if(node.nodeType==1) {
			if(pos<0) {
				pos=0;
			} else if (pos>node.childElementCount) {
				pos=node.childElementCount;
			}
			if(o instanceof PageKit) {
				o.each(function(elem) {
					xhr.insert(elem,pos);
					pos++;
				});
			} else if(o.nodeType==1){
				if(pos==node.childElementCount) {
					//在最后
					node.appendChild(o);
				} else {
					// 在pos之前/
					node.insertBefore(o,node.children[pos]);
				}
			} else if(typeof o=="string") {
				xhr.insert($($(node.cloneNode(false)).code(o).get().children),pos);
			}
		}
		return this;
	},
	// 添加第一子节点
	prepend:function(o) {
		var node=this.get();
		if(!node) {
			return this;
		} else if(node.nodeType==1) {
			if(node.firstElementChild) {
				if(o instanceof PageKit) {
					var insertPlace=node.firstElementChild;
					o.each(function(elem) {
						node.insertBefore(elem,insertPlace);
					});
				} else if(o.nodeType==1){
					node.insertBefore(o,node.firstElementChild);
				} else if(typeof o=="string") {
					node.innerHTML=o+node.innerHTML;
				}
			} else {
				this.append(o);
			}
		}
		return this;
	},
	// 作为子节点追加到对象
	appendTo:function(o) {
		if(o instanceof PageKit) {
			o.append(this);
		} else if(o.nodeType==1) {
			PageKit(o).append(this);
		}
		return this;
	},
	// 作为子节点插入到对象
	insertTo:function(o,pos) {
		if(o instanceof PageKit) {
			o.insert(this,pos);
		} else if(o.nodeType==1) {
			PageKit(o).insert(this,pos);
		}
		return this;
	},
	// 作为第一子节点添加到对象
	prependTo:function(o) {
		if(o instanceof PageKit) {
			o.prepend(this);
		} else if(o.nodeType==1) {
			PageKit(o).prepend(this);
		}
		return this;
	},
	// 查找符合条件的子节点
	find:function(str) {
		var res=new Array();
		this.each(function(elem) {
			res=res.concat(Array.prototype.slice.call(elem.querySelectorAll(str)))
		});
		return PageKit(res);
	},
	// 过滤出有符合条件子节点的节点
	// o可以为字符串，作为CSS选择器。也可为函数，function(elem)，返回false或等价物时滤除。也可为一Object，表示期望有的属性:值
	filter:function(o) {
		if(!o) {
			return this;
		}
		var res=new Array();
		if(typeof o=="string") {
			this.each(function(elem) {
				if(elem.querySelector(o)) {
					res.push(elem);
				}
			});
		} else if(typeof o=="function") {
			this.each(function(elem) {
				if(o(elem)) {
					res.push(elem);
				}
			});
		} else if(typeof o=="object") {
			this.each(function(elem) {
				var flag=true;
				for(var p in o) {
					if(!(elem[p]===o[p])) {
						flag=false;
						break;
					}
				}
				if(flag) {
					res.push(elem);
				}
			});
		}
		this.nodes=res;
		return this;
	},
	// 设置/读取属性，设置方法：o为{name1:value1,name2:value2}形式或o为name,v为value，读取方法：o为name,v留空
	attr:function(o,v) {
		switch(typeof o) {
			case "object":
				for(var n in o) {
					this.each(function(elem) {
						if(o[n]!=null) {
							elem.setAttribute(n,o[n]);
						} else {
							elem.removeAttribute(n);
						}
					});
				};
				return this;
			case "string":
				if(v!=null) {
					this.each(function(elem) {
						elem.setAttribute(o,v);
					});
					return this;
				} else {
					try {
						return this.get().getAttribute(o);
					} catch(ex) {
						return null;
					}
				}
		}
		return this;
	},
	// 设置/读取DOM属性，方法同attr。
	prop:function(o,v) {
		switch(typeof o) {
			case "object":
				for(var n in o) {
					this.each(function(elem) {
						elem[n]=o[n];
					});
				};
				return this;
			case "string":
				if(v!=null) {
					this.each(function(elem) {
						elem[o]=v;
					});
					return this;
				} else {
					try {
						return this.get()[o];
					} catch(ex) {
						return null;
					}
				}
		}
		return this;
	},
	// 设置/读取CSS属性，设置方法：o为{name1:value1,name2:value2}形式或o为name,v为value，读取方法：o为name,v留空
	style:function(o,v) {
		switch(typeof o) {
			case "object":
				for(var n in o) {
					this.each(function(elem) {
						elem.style[n]=o[n];
					});
				};
				return this;
			case "string":
				if(v!=null) {
					this.each(function(elem) {
						elem.style[o]=v;
					});
					return this;
				} else {
					try {
						return this.get().style[o];
					} catch (ex) {
						return null;
					}
				}
		}
		return this;
	},
	// 增加一个类
	addClass: function(str) {
		this.each(function(elem) {
			var mem=$(elem);
			var c=mem.attr("class");
			if(!c) {
				mem.attr("class",str);
			} else if(!c.match(new RegExp("\\b"+str+"\\b"))) {
				mem.attr("class",c+" "+str);
			}
		});
		return this;
	},
	// 去除一个类
	removeClass:function(str) {
		this.each(function(elem) {
			var mem=$(elem);
			var c=mem.attr("class");
			if(c && c.match(new RegExp("\\b"+str+"\\b"))) {
				mem.attr("class",c.replace(new RegExp("\\b"+str+"\\b"),"").replace(/^ +| +$/g,""));
			}
		});
		return this;
	},
	// 获取/设置文本内容
	text:function(txt) {
		if(txt!=null) {
			this.each(function(elem) {
				elem.textContent=txt.toString();
			});
			return this;
		} else {
			var elem=this.get();
			if(elem==null) {
				return "";
			} else {
				return elem.textContent || "";
			}
		}
	},
	// 获取/设置内部HTML代码
	code:function(html) {
		if(html!=null) {
			this.each(function(elem) {
				elem.innerHTML=html;
			});
			return this;
		} else {
			var elem=this.get();
			if(elem==null) {
				return "";
			} else {
				return elem.innerHTML || "";
			}
		}
	},
	// 获取/设置对象的值。可输入控件为其输入值，其余为其内部文本
	value:function(v) {
		if(v!=null) {
			// 设置
			this.each(function(elem) {
				switch(elem.tagName) {
					case "INPUT":
						switch(($(elem).attr("type") || "").toLowerCase()) {
							case "checkbox":
								elem.checked=v;
								break;
							default:
								elem.value=v;
								break;
						}
						break;
					case "TEXTAREA":
						elem.value=v;
						break;
					default:
						$(elem).text(v);
						break;
				}
			});
			return this;
		} else {
			// 读取
			var elem=this.get();
			switch(elem.tagName) {
				case "INPUT":
					switch(($(elem).attr("type") || "").toLowerCase()) {
						case "checkbox":
							return elem.checked;
						default:
							return elem.value;
					}
				case "TEXTAREA":
					return elem.value;
				default:
					return $(elem).text();
			}
		}
	},
	// 添加事件监听函数。可以有多个事件。由逗号分隔
	hook:function(evt,func,capture) {
		var e=evt.split(",");
		this.each(function(elem) {
			for(var i=0;i<e.length;i++) {
				elem.addEventListener(e[i],func,!!capture);
			}
		});
		return this;
	},
	// 解除事件监听
	unhook:function(evt,func,capture) {
		var e=evt.split(",");
		this.each(function(elem) {
			for(var i=0;i<e.length;i++) {
				elem.removeEventListener(e[i],func,!!capture);
			}
		});
		return this;
	},
	// 复制所有DOM节点到新对象
	clone:function() {
		var nodes=[];
		this.each(function(elem) {
			nodes.push(elem.cloneNode(true));
		});
		return PageKit(nodes);
	}
};




/* 以下是MeMemo用到的函数 */


// 添加导航栏标签
function addToNavigateBar() {
	var entry=$node("li").attr("id","showMeMemo").append($node("a").attr({href:"javascript:;",onfocus:"this.blur();"}).text("MeMemo"));
	entry.appendTo($(".feed-header .feed-filter"));
};

// 清除Feeds
function removeFeeds() {
	const target="#feedHome";
	$ban(target);
	entry = $node("div").code('<ul class="feeds richlist" id="meMemoFeedHome">');
	entry.appendTo($("#feedHolder"));
}

// 检查是否有到期的条目
function hasScheduledItems() {
	$get(MEM.server + "xnmemo/has_scheduled_items/",function(html) {
		if(!html) {
			$popup("MeMemo",'hasScheduledItems failed.',null,3,10);
			return;
		}
		data = JSON.parse(html);
		if (data.status == "failed") {
			// 未验证用户
			$popup("MeMemo 登陆",'请先<a target="_blank" href="'+MEM.server+'account/login/"'+">登陆</a>",null,10,10);
			return;
		}
		if (data.scheduled_items > 0) {
			$popup("MeMemo",'您今天有 ' + data.scheduled_items + ' 个单词需要复习',null,10,10);
			return data.scheduled_items;
		}
	});
}

// 获取到期的条目
function getScheduledItems() {
	$get(MEM.server + "xnmemo/get_items/",function(html) {
		if(!html) {
			$popup("MeMemo",'getScheduledItems failed.',null,3,10);
			return;
		}
		data = JSON.parse(html);
		if (data.status == "failed") {
			// 未验证用户
			$popup("MeMemo 登陆",'请先<a target="_blank" href="'+MEM.server+'account/login/"'+">登陆</a>","320x0+500-300",10,10);
			return;
		}
		var items=data.records;
		$alloc("scheduledItems").list=items;
		addMeMemoEntries();
	});
}

// 更新条目
function updateItem(id, newGrade) {
	$get(MEM.server + "xnmemo/update_item/?"+"_id="+id+"&new_grade="+newGrade,function(html) {
		if(!html) {
			alert("updateItem failed.");
			return;
		}
		var result=JSON.parse(html).status;
		if (result == "failed") {
			alert("updateItem failed.");
		}
		else if (result == "succeed") {
			//~ alert("updateItem succeeded.");
			$popup("MeMemo","updateItem succeeded.",null,3,10);
		}
	});
}

// 打分并且更新条目
function gradeItem(id, newGrade) {
	if (!id || ! newGrade) {
		alert("id or newGrade us empty!");
		return;
	}
	else {
		updateItem(id, newGrade);
	}
}

// 永久跳过条目
function skipItem(id) {
	if (!id) {
		alert("id cannot be empty!");
		return;
	}
	else {
		$get(MEM.server + "xnmemo/skip_item/?"+"_id="+id,function(html) {
			if(!html) {
				alert("skipItem failed.");
				return;
			}
			var result=JSON.parse(html).status;
			if (result == "failed") {
				alert("skipItem failed.");
			}
			else if (result == "succeed") {
				$popup("MeMemo","skipItem succeeded.",null,3,10);
			}
		});
	}
}

// 添加MeMemo条目
function addMeMemoEntry(item) {
	if ($('#memoItem_' + item._id).empty()) {
		var entry=$node("li").attr("id","memoItem_" + item._id);
		var h3 = $node("h3")
		$node("").text(item.question).appendTo(h3);
		$node("span").attr({"class":"statuscmtitem",
							"onmouseout":"$('memoAnswer_" + item._id +"').hide()",
							"onmouseover":"$('memoAnswer_" + item._id +"').show()",
							}).text("解释：").append($node("span").attr(
							{"style":"display: none;",
							"id":"memoAnswer_" + item._id}).text(item.answer)).appendTo(h3);
		h3.appendTo(entry);
		$node("div").attr({"class":"content"}).append($node("blockquote").text(item.note)).appendTo(entry);
		gradeArea = $node("div").attr("class","details").append($node("span").attr("class","legend").text("困难  "));
		// 添加评分按钮
		for (var i=0;i<=5;i++) {
			gradeBtn = $node("input").attr({"type":"button","class":"input-button","value":i});
			gradeBtn.hook("click", function (evt) {
				gradeItem(item._id,evt.target.getAttribute("value"));
				// delete item from page
				$ban(evt.target.parentNode.parentNode);
				});
			gradeBtn.appendTo(gradeArea);
			//~ $node("span").attr("class", "seperator").text("|").appendTo(gradeArea);
		}
		$node("span").attr("class","legend").text("  简单").appendTo(gradeArea);
		// 添加跳过按钮
		skipBtn = $node("input").attr({"type":"button","class":"input-button","value":"永久跳过","style":"position: absolute; right: 0pt;"});
		skipBtn.hook("click", function (evt) {
			skipItem(item._id);
			// delete item from page
			$ban(evt.target.parentNode.parentNode);
			});
		skipBtn.appendTo(gradeArea);
		gradeArea.appendTo(entry);
		entry.appendTo($("#meMemoFeedHome"));
	}
};



// 更新MeMemo条目
function updateMeMemoEntry(record) {
};


function addMeMemoEntries() {
	if($allocated("scheduledItems")) {
		items = $alloc("scheduledItems").list;
		for(var i=0;i<items.length;i++) {
			addMeMemoEntry(items[i]);
		}
	}
	else {
		$popup("MeMemo","scheduledItems not allocated.",null,3,10);
		return null;
	}
};




// 可以开始了
switch(MEM.agent) {
	case USERSCRIPT:
		main(JSON.parse(GM_getValue("mem_options","{}")));
		addToNavigateBar();
		hasScheduledItems();
		$("#showMeMemo a").hook("click",function (evt) {
			$("#showMeMemo").attr({"class":"current"});
			removeFeeds();
			getScheduledItems();
			});

		break;
	default:
		throw "unsupported browser";
};

})();
