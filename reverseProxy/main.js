/**
 * Reverse Proxy
 * Author: IsKongKongYa
 * Features: 
 *   - 自动识别 multipart/json/text/urlencoded，支持文件上传
 *   - 完整透传 Range（视频/音频）
 *   - 支持跨域、Basic Auth 鉴权、域名黑名单
 *   - 自动读取配置，文件变动自动更新
 *   - 结构简洁、稳定、高性能
 */

const fs = require("fs");
const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const chokidar = require("chokidar");
const session = require("express-session");
const basicAuth = require("basic-auth");
const tools = require("./tools");

// 获取本机 IP（用于过滤）
let ipv4 = "",
	ipv6 = "";
tools.ipv4.then(ip => ipv4 = ip).catch(() => {});
tools.ipv6.then(ip => ipv6 = ip).catch(() => {});

// ---------------------------
// 1. 加载配置（自动带默认值）
// ---------------------------
function loadConfigSafe() {
	try {
		const raw = fs.readFileSync("./test.json", "utf8");
		const conf = JSON.parse(raw);

		return {
			port: conf.port ?? 8082,
			timeout: conf.timeout ?? 60000,
			session: {
				secret: conf.session?.secret ?? "proxy-secret",
				name: conf.session?.name ?? "proxySession",
				resave: false,
				saveUninitialized: false,
				cookie: {
					maxAge: conf.session?.maxAge ?? 86400000,
					secure: conf.session?.secure ?? false
				}
			},
			accessOrigin: conf.accessOrigin ?? "*",
			user: conf.user ?? "",
			pwd: conf.pwd ?? "",
			defaultSkip: conf.defaultSkip ?? "",
			limiter: {
				windowMs: conf.limiter?.windowMs ?? 1000,
				max: conf.limiter?.max ?? 3,
				message: conf.limiter?.message ?? "请求过于频繁，请稍后再试",
				statusCode: conf.limiter?.statusCode ?? 429
			},
			blacklist: conf.blacklist ?? []
		};
	} catch (err) {
		console.error("读取配置失败:", err.message);
		return {};
	}
}

let config = loadConfigSafe();

// 自动热更新配置
chokidar.watch("./test.json").on("change", () => {
	console.log("配置文件变更，重新加载...");
	config = loadConfigSafe();
});

// ---------------------------
// 2. 初始化 Express
// ---------------------------
const app = express();

// JSON / 文本 / URLENCODED
app.use(express.json({
	limit: "50mb"
}));
app.use(express.urlencoded({
	extended: true,
	limit: "50mb"
}));
app.use(express.text({
	type: "text/plain",
	limit: "50mb"
}));

// multipart 交给原始 body（用于文件上传）
app.use(express.raw({
	type: req => req.headers["content-type"]?.startsWith("multipart/form-data"),
	limit: "200mb"
}));

// Session
app.use(session(config.session));

// ---------------------------
// 3. CORS
// ---------------------------
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", config.accessOrigin);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers",
		req.headers["access-control-request-headers"] || "content-type"
	);

	if (req.method === "OPTIONS") return res.sendStatus(204);
	next();
});

// ---------------------------
// 4. 基础鉴权（Basic Auth）
// ---------------------------
function authMiddleware(req, res, next) {
	if (!config.user || !config.pwd) return next();
	const credentials = basicAuth(req);

	if (!credentials ||
		credentials.name !== config.user ||
		credentials.pass !== config.pwd) {
		res.setHeader("WWW-Authenticate", 'Basic realm="Restricted"');
		return res.status(401).send("未授权访问");
	}
	next();
}
app.use("/", authMiddleware);

// ---------------------------
// 5. Static 静态页面（如果有）
// ---------------------------
app.use("/web", express.static("webPro"));

// ---------------------------
// 6. 频率限制（全局）
// ---------------------------
const limiter = rateLimit(config.limiter);
app.use("/*", limiter);

// ---------------------------
// 7. URL 校验与黑名单
// ---------------------------
function isValidUrl(url) {
	return /^https?:\/\/.+/i.test(url);
}

function isBlacklisted(url) {
	if (!config.blacklist?.length) return false;
	return new RegExp(config.blacklist.join("|"), "i").test(url);
}

function getTargetUrl(baseUrl, path) {
	if (!baseUrl) return '';
	const normalizedPath = path.replace(/^\//, ''); // 去掉路径前的斜杠
	//如果有路径则添加路径，需要额外判断原始URL是否以/结尾来做不同处理
	return normalizedPath ? (baseUrl.endsWith('/') ? `${baseUrl}${normalizedPath}` : `${baseUrl}/${normalizedPath}`) :
		`${baseUrl}`;
}

// ---------------------------
// 8. 主代理逻辑
// ---------------------------
app.all("/*", async (req, res) => {
	try {
		const reqUrl = req.query.url === "undefined" || !req.query.url ? req.session.url : req.query.url;
		const length = Object.keys(req.query).length;
		const reqHeaders = JSON.parse(req.query.headers || '{}');
		const method = req.query.method?.toUpperCase() || req.method;

		if (!reqUrl) {
			if (config.defaultSkip) return res.redirect(config.defaultSkip);
			return res.status(400).send("缺少 url 参数");
		}

		if (!isValidUrl(reqUrl))
			return res.status(400).send("URL 格式不正确");

		if (isBlacklisted(reqUrl))
			return res.status(403).send("该域名已被禁止访问");

		// 更新会话的 URL 参数
		if (reqUrl) {
			req.session.url = reqUrl;
		}

		console.log(`会话中的链接：${req.session.url}`);

		const baseUrl = req.session.url || '';

		if (!baseUrl) {
			if (config.defaultSkip) {
				return res.redirect(config.defaultSkip);
			} else {
				return res.status(400).send(
					'<h2></h2><script>let second = 3;let listener = setInterval(()=>{ document.querySelector("h2").innerText = `会话中并未发现URL参数，${second}秒后自动跳转首页！`; if(second <= 0){clearInterval(listener);location.href="/web/index.html";}else{--second;}},1000);</script>'
				);
			}
		}

		// 拼接 URL + path
		const fullUrl = getTargetUrl(baseUrl, req.path);
		console.log(`[Proxy] ${req.ip} =>${req.method} ${fullUrl}`);

		// -----------------------
		// 构造 headers
		// -----------------------
		// 删除客户端身份鉴权
		delete req.headers['authorization'];
		// 将查询字符串中自定义的请求头添加到handleHeaders
		let handleHeaders = {};
		if (Object.keys(reqHeaders).length) {
			for (let key in reqHeaders) {
				handleHeaders[key.toLowerCase()] = reqHeaders[key];
			}
		}

		const headers = {
			...req.headers,
			host: new URL(fullUrl).host,
			referer: new URL(baseUrl).origin,
			origin: new URL(baseUrl).origin,
			...handleHeaders
		};

		// -----------------------
		// 删除可能引起各种问题的头
		// -----------------------
		delete headers["content-length"];
		delete headers['accept-encoding']; // 启动自动编码
		// 删除代理信息(实现匿名代理)
		delete headers['x-forwarded-for'];
		delete headers['x-forwarded-host'];
		delete headers['x-forwarded-proto'];
		// 删除Cloudflare相关请求头（如果域名托管在Cloudflare，建议保留）
		delete headers['cf-ray'];
		delete headers['cdn-loop'];
		delete headers['cf-connecting-ip'];
		delete headers['cf-ipcountry'];
		delete headers['cf-visitor'];
		delete headers['priority'];

		console.log(`处理后的请求头：${JSON.stringify(headers)}`);

		// 保留 Range（让目标服务器处理视频）
		if (req.headers.range) {
			headers.range = req.headers.range;
		}

		// -----------------------
		// 构造 body
		// -----------------------
		let body = undefined;

		if (method === "GET" || method === "HEAD") {
			body = undefined;
		} else {
			body = req.body instanceof Buffer ? req.body : req.body;
		}

		const requestOrigin = req.headers['origin'] || '';

		// -----------------------
		// 发起代理请求
		// -----------------------
		const proxyResp = await axios({
			method,
			url: fullUrl,
			headers,
			data: body,
			responseType: "stream",
			validateStatus: () => true // 允许透传非 200
		});

		// -----------------------
		// 修复目标服务器响应头
		// -----------------------
		res.status(proxyResp.status);
		for (const [key, val] of Object.entries(proxyResp.headers)) {
			res.setHeader(key, val);
		}

		// -----------------------
		// 允许前端跨域请求（使用localhost请求需要处理较麻烦，使用127.0.0.1请求无需处理）
		// -----------------------
		if (res.hasHeader('access-control-allow-origin')) {
			res.setHeader('access-control-allow-origin', requestOrigin)
		}

		// -----------------------
		// 过滤敏感 IP
		// -----------------------
		if (proxyResp.headers["content-type"]?.includes("text")) {
			let buf = "";
			proxyResp.data.on("data", c => buf += c.toString());
			proxyResp.data.on("end", () => {
				buf = buf.replaceAll(ipv4, "").replaceAll(ipv6, "");
				res.send(buf);
			});
		} else {
			proxyResp.data.pipe(res);
		}

	} catch (err) {
		console.error("代理异常：", err.message);

		if (err.response) {
			return res.status(err.response.status).send("目标服务器错误：" + err.message);
		}
		if (err.request) {
			return res.status(504).send("目标服务器未响应：" + err.message);
		}
		return res.status(500).send("服务器内部错误：" + err.message);
	}
});

// ---------------------------
// 9. 启动服务
// ---------------------------
const server = app.listen(config.port, () => {
	console.log(`Reverse Proxy running on port ${config.port}`);
});

server.setTimeout(config.timeout);
