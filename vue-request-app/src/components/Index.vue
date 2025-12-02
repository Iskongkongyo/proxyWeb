<template>
	<el-container v-if="isShow" @keydown.enter="sendRequest">
		<el-header style="color:#409EFF;font-size: 40px" height="75px">
			<el-row>
				<el-col :span="24">
					在线代理网站
				</el-col>
			</el-row>
		</el-header>
		<el-main>

			<!-- 移动端第一行: 请求方法、API URL 和发送按钮 -->
			<el-row style="margin-bottom: 20px;" v-if="mobile">
				<el-col justify="start">
					<el-input v-model="url" placeholder="Enter API URL" class="input-with-select" clearable>
						<template #prepend>
							<el-select v-model="method" placeholder="Select" style="width: 115px"
								@change="method != 'GET' && method != 'HEAD' ? activeTab = 'body' : activeTab = 'params'">
								<el-option v-for="option in methods" :key="option.value" :label="option.label"
									:value="option.value" />
							</el-select>
						</template>
						<template #append>
							<el-icon class="el-icon--left" @click="sendRequest">
								<Search />
							</el-icon>
						</template>
					</el-input>
				</el-col>
			</el-row>

			<!-- PC端第一行: 请求方法、API URL 和发送按钮 -->
			<el-row :gutter="10" style="margin-bottom: 20px;" v-if="!mobile">
				<el-col :span="6">
					<el-select v-model="method" placeholder="请求方法" style="width: 100%;"
						@change="method != 'GET' && method != 'HEAD' ? activeTab = 'body' : activeTab = 'params'">
						<el-option v-for="option in methods" :key="option.value" :label="option.label"
							:value="option.value">
							<template #default>
								<el-tag :type="option.type"
									style="width: 100%; text-align: center;">{{ option.label }}</el-tag>
							</template>
						</el-option>
					</el-select>
				</el-col>
				<el-col :span="12">
					<el-input v-model="url" clearable placeholder="Enter API URL" />
				</el-col>
				<el-col :span="1" justify="start">
					<el-button type="primary" @click="sendRequest" block><el-icon class="el-icon--left">
							<Search />
						</el-icon>发送请求</el-button>
				</el-col>
			</el-row>

			<!-- 第二行: 请求头、请求体、查询参数 -->
			<el-row :gutter="10" style="margin-bottom: 20px;">
				<el-col :span="24">
					<div class="button-group">
						<el-button type="info" plain @click="activeTab = 'headers'" class="button-item">请求头</el-button>
						<el-button type="info" plain v-show="method != 'GET' && method != 'HEAD'"
							@click="activeTab = 'body'" class="button-item">请求体</el-button>
						<el-button type="info" plain @click="activeTab = 'auth'" class="button-item">验证类型</el-button>
						<el-button type="info" plain @click="activeTab = 'params'" class="button-item">查询参数</el-button>
						<el-button type="success" @click="addRow(activeTab)" class="button-item"><el-icon
								class="el-icon--left">
								<Plus />
							</el-icon>新增一行</el-button>
						<el-button type="primary" @click="()=>{copy(0)}" class="button-item"><el-icon
								class="el-icon--left">
								<CopyDocument />
							</el-icon> 复制页面链接</el-button>
						<el-button type="primary" @click="()=>{copy(1)}" class="button-item"><el-icon
								class="el-icon--left">
								<CopyDocument />
							</el-icon> 复制API接口</el-button>
						<el-button v-if="downloadUrl" type="primary" @click="downloadResponse"
							class="button-item"><el-icon class="el-icon--left">
								<Download />
							</el-icon>下载响应内容</el-button>
						<el-button type="info" class="button-item" @click="historyRecords"><el-icon
								class="el-icon--left">
								<Collection />
							</el-icon> 历史记录</el-button>
					</div>
				</el-col>
			</el-row>

			<el-card>
				<!-- 请求体 -->
				<RequestBody v-show="activeTab === 'body'" @submit-payload="onReceiveBody" ref="body" />

				<!-- 用户验证 -->
				<UserAuth v-show="activeTab === 'auth'" @userAuth="handleAuth" ref="userAuth" />

				<!-- 动态表格 -->
				<el-table v-if="activeTab && activeTab != 'auth' && activeTab != 'body'" :data="tableData[activeTab]"
					style="margin-bottom: 20px;">
					<el-table-column prop="key" :label="'Key（'+buttons[activeTab]+')'">
						<template #default="scope">
							<el-input v-model="scope.row.key" clearable />
						</template>
					</el-table-column>
					<el-table-column prop="value" :label="'Value（'+buttons[activeTab]+')'">
						<template #default="scope">
							<el-input v-model="scope.row.value" clearable />
						</template>
					</el-table-column>
					<el-table-column :label="'操作（'+buttons[activeTab]+')'">
						<template #default="{ $index }">
							<el-button type="danger" @click="removeRow(activeTab, $index)"><el-icon
									class="el-icon--left">
									<Delete />
								</el-icon>删除</el-button>
						</template>
					</el-table-column>
				</el-table>
			</el-card>

			<!-- 响应内容 -->
			<el-card style="margin-top: 20px;">
				<template #header>
					<span>响应内容</span>
				</template>
				<div v-if="responseType === 'json' || responseType === 'text'">
					<pre>{{ response }}</pre>
				</div>
				<div v-else-if="responseType === 'image'">
					<img :src="responseUrl" alt="Response Image" style="max-width: 100%;" />
				</div>
				<div v-else-if="responseType === 'video'">
					<video controls :src="responseUrl" ref="videoPlayer" style="max-width: 100%;"></video>
				</div>
				<div v-else-if="responseType === 'audio'">
					<audio controls :src="responseUrl" style="max-width: 100%;"></audio>
				</div>
				<div v-else-if="responseType === 'file'">
					<a :href="responseUrl" :download="responseFile">点击下载文件</a>
				</div>
				<div v-else-if="method === 'HEAD'">
					<pre>{{ resHead }}</pre>
				</div>
				<div v-else>
					<pre>{{ response }}</pre>
				</div>
			</el-card>

			<!-- 返回顶部 -->
			<el-backtop :bottom="100">
				<div class="backup">
					<el-icon>
						<Top />
					</el-icon>
				</div>
			</el-backtop>

		</el-main>
	</el-container>
</template>

<script>
	import {
		watchEffect
	} from 'vue';
	import {
		ElMessage,
		ElMessageBox
	} from 'element-plus';
	import {
		useRoute,
		useRouter
	} from 'vue-router';
	import axios from 'axios';

	import UserAuth from './UserAuth.vue';
	import RequestBody from './RequestBody.vue';
	export default {
		name: 'RequestForm',
		components: {
			UserAuth,
			RequestBody
		},
		data() {
			return {
				url: '',
				method: 'GET',
				mobile: false, //是否是移动端
				isShow: false, //是否显示
				activeTab: 'params',
				queryParams: {}, // 存储查询参数的对象
				buttons: {
					'headers': '请求头',
					'body': '请求体',
					'params': '查询参数'
				},
				display: 0, //展示方式
				latest: null, //接受请求体信息的对象
				recordSize: 380, //历史记录大小
				patt: /https?:\/\/[^\s/$.?#].[\s]*/, //URL简单正则
				methods: [{
						value: 'GET',
						label: 'GET',
						type: 'success'
					},
					{
						value: 'POST',
						label: 'POST',
						type: 'primary'
					},
					{
						value: 'PUT',
						label: 'PUT',
						type: 'warning'
					},
					{
						value: 'DELETE',
						label: 'DELETE',
						type: 'danger'
					}, {
						value: 'PATCH',
						label: 'PATCH',
						type: 'default'
					},
					{
						value: 'HEAD',
						label: 'HEAD',
						type: 'info'
					},
				],
				tableData: {
					headers: [{
						key: '',
						value: ''
					}],
					params: [{
						key: '',
						value: ''
					}],
				},
				auth: '',
				response: '',
				contentType: '',
				resHead: '',
				responseType: '', // New data field to store response type
				responseUrl: '', // New field to store URL for downloadable content
				responseFile: '',
				downloadUrl: '', // New field to store downloadable file URL
			};
		},
		mounted() {
			const route = useRoute();
			const router = useRouter();
			const that = this;
			const userAgent = navigator.userAgent || navigator.vendor || window.opera;
			// 检查是否为移动设备
			this.mobile = /iPhone|iPad|iPod|Android|BlackBerry|BB10|Silk|Mobi|Opera Mini|Windows Phone|webOS|UCBrowser/i
				.test(userAgent);

			this.recordSize = screen.availWidth - 30;

			router.isReady().then(() => {
				this.queryParams = route.query;
				console.log(JSON.stringify(this.queryParams));
				this.url = decodeURIComponent(this.queryParams.url || '');
				this.method = (this.queryParams.method || 'GET').toUpperCase();
				this.tableData.headers = JSON.parse(this.queryParams.headers || "[{}]");
				this.tableData.params = JSON.parse(this.queryParams.params || "[{}]");
				this.display = this.queryParams.display || 0;
				this.display === '1' ? this.$emit('update-message', false) : this.$emit('update-message', true);
				this.display === '1' ? this.isShow = false : this.isShow = true;
			});

			//watchEffect 监听 display
			watchEffect(() => {
				if (this.display && this.display != '0') {
					console.log('执行跳转');
					that.sendRequest();
				}
			});

		},
		methods: {
			addRow(tab) {
				if (tab) {
					this.tableData[tab].push({
						key: '',
						value: ''
					});
				}
			},
			removeRow(tab, index) {
				if (tab) {
					this.tableData[tab].splice(index, 1);
				}
			},
			handleSearch(originArr) {
				let resultArr = [];
				originArr.forEach((value) => {
					console.log(value);
					value.key ? resultArr.push({
						"key": value.key,
						"value": value.value
					}) : true
				});
				JSON.stringify(resultArr) === JSON.stringify([]) ? resultArr = '' : resultArr = JSON.stringify(resultArr);
				return resultArr;
			},
			copy(patt) {

				if (!this.patt.test(this.url)) {
					return ElMessage.error('请检查请求URL是否为空或格式有误！');
				}

				const that = this;
				if (!this.display) {
					this.$refs.userAuth.handle();
				}
				if (patt == 1) {
					// 复制API接口
					const apiUrl = new URL(location.origin);
					const nowUrl = new URL(that.url);
					const urlParams = nowUrl.searchParams;
					const queryString = that.tableData.params;
					for (let obj of queryString) {
						console.log(obj);
						if (Object.keys(obj).toString() === 'key,value' && Object.values(obj)[0] != '') {
							urlParams.append(obj.key, obj.value);
						}
					}
					apiUrl.searchParams.append('url', `${nowUrl.origin}${nowUrl.pathname}?${urlParams.toString()}`);
					apiUrl.searchParams.append('method', that.method);

					let finHeaders = {};

					// 处理子组件Auth请求头内容（注意：手动在设置请求头中Auth优先级最高）
					this.auth ? finHeaders['authorization'] = this.auth : true;

					that.tableData.headers.forEach((value) => {
						value.key ? finHeaders[value.key] = value.value : true
					});
					apiUrl.searchParams.append('headers', JSON.stringify(finHeaders));

					return that.copyLinkToClipboard(apiUrl.href, '当前配置API接口已复制到剪切板！');
				}

				// 下面为复制页面链接
				const url = new URL(location.origin + location.pathname);
				url.searchParams.append('url', this.url);

				// 处理子组件Auth请求头内容（注意：手动在设置请求头中Auth优先级最高）
				let array = [];
				let result = false;

				this.tableData.headers.forEach((value) => {
					if (value.key?.toLowerCase() === 'authorization' && value.value) {
						result = true;
						array.push(value);
					} else if (value.value) {
						array.push(value);
					}
				});

				this.$refs.userAuth.handle();

				if (!result && this.auth) {
					array.push({
						key: "authorization",
						value: this.auth
					})
				}

				url.searchParams.append('headers', this.handleSearch(array));
				url.searchParams.append('method', this.method);
				url.searchParams.append('params', this.handleSearch(this.tableData.params));
				url.searchParams.append('display', 0);
				console.log(`完整URL：${url.href}`);
				if (patt) {
					return url.href;
				}
				this.copyLinkToClipboard(url.href, '当前配置页面链接已复制到剪切板！');
			},
			handleAuth(value) {
				this.auth = value;
			},
			historyRecords() {
				this.$emit('update-message', false);
				this.$router.push('/web/history');
			},
			async copyLinkToClipboard(text, msg) {
				try {
					await navigator.clipboard.writeText(text);
					ElMessage.success(msg || '已复制到剪切板！');
				} catch (err) {
					ElMessage.error(`复制失败：${err.message}`);
					ElMessageBox.confirm(
							'链接复制失败，是否跳转以获取当前配置API链接？',
							'温馨提示', {
								confirmButtonText: '跳转',
								cancelButtonText: '不跳转',
								type: 'warning',
							}
						)
						.then(() => {
							window.open(text, '_blank')
						})
						.catch((err) => {
							return ElMessage.error(`跳转失败：${err.message}`);
						})
				}
			},
			reader(data) {
				const reader = new FileReader();
				const that = this;
				reader.onload = function(event) {
					const result = event.target.result; // 读取结果
					if (that.display && that.display != '0') {
						document.open();
						document.write(result);
						document.close();
					} else {
						that.response = result;
					}
				};
				reader.readAsText(data);
			},
			getFileExtension(url) {
				// 使用正则表达式匹配最后一个点后的内容
				let match = url.match(/\.[0-9a-z]+$/i);
				if (match) {
					return match[0].substring(1); // 返回扩展名
				}
				return '';
			},
			// 子组件回传请求体信息
			onReceiveBody(payload) {
				this.latest = payload;
			},
			async sendRequest() {
				console.log(`查询字符串内容：${JSON.stringify(this.tableData.params)}`);
				const display = this.display; //数据展示方式，0为响应内容部分展示，1为跳转新页面展示

				if (!this.patt.test(this.url)) {
					return ElMessage.error('请检查请求URL格式是否有误！');
				}

				const nowUrl = new URL(this.url);
				const urlParams = nowUrl.searchParams;
				const queryString = this.tableData.params;
				let headers = [];

				// 处理子组件Auth请求头内容
				if (!display) {
					this.$refs.userAuth.handle();
					this.auth ? headers.push({
						"key": "authorization",
						"value": this.auth
					}) : true;
				}


				// 处理自定义Cookie，因Cookie无法手动修改，通过document.cookie将Cookie写入客户端
				for (let obj of this.tableData.headers) {
					// 末尾添加“;domain=;path=/;”使得Cookie在当前域名和根目录下生效
					if (obj && obj.key) { // 确保 obj 和 obj.key 存在
						if (obj.key.toUpperCase() === 'COOKIE' || obj.key.toUpperCase() === 'COOKIES') {
							document.cookie = obj.value + ';domain=;path=/;';
						} else {
							headers.push({
								"key": obj.key,
								"value": obj.value
							});
						}
					}
				}

				for (let obj of queryString) {
					console.log(obj);
					if (Object.keys(obj).toString() === 'key,value' && Object.values(obj)[0] != '') {
						urlParams.append(obj.key, obj.value);
					}
				}

				let requestUrl;

				if (urlParams.toString()) {
					requestUrl = `${nowUrl.origin}${nowUrl.pathname}?${urlParams.toString()}`;
				} else {
					requestUrl = nowUrl;
				}


				let finHeaders = {};

				headers.forEach((value) => {
					value.key ? finHeaders[value.key] = value.value : true
				});

				const finReqUrl = 'http://localhost:8082/?url=' + encodeURIComponent(requestUrl) + '&headers=' +
					encodeURIComponent(JSON.stringify(finHeaders));

				console.log(`最终请求URL：${finReqUrl}`);

				const records = JSON.parse(localStorage.getItem('history') || "[]");
				const date = new Date();
				const time =
					`${date.getFullYear()}.${date.getMonth()+1}.${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
				const newRecords = [{
					"date": time,
					"url": decodeURIComponent(this.copy(2))
				}].concat(records);
				localStorage.setItem('history', JSON.stringify(newRecords));

				//withCredentials: true表示携带Cookie
				const config = {
					method: this.method.toUpperCase(),
					url: finReqUrl,
					withCredentials: true
				};

				// 根据请求方法设置请求体信息
				if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(this.method.toUpperCase())) {
					// 从子组件获取请求体信息
					this.latest = null;
					this.$refs.body.buildAndEmit();
					if (this.latest) {
						config.data = this.latest.body;
						config.headers = config.headers || {};
						config.headers['Content-Type'] = this.latest.contentType;
					}
				}

				// 设置响应类型
				const isBinary = this.method.toUpperCase() === 'GET'; // 假设只在 GET 请求时访问二进制资源

				if (isBinary) {
					config.responseType = 'blob'; // 设置为 blob 以处理二进制数据
				}

				console.log(JSON.stringify(config));

				try {
					const res = await axios(config);
					if (isBinary) {
						this.handleResponse(res, display);
					} else {
						this.resHead = res.headers;
						this.response = JSON.stringify(res.data, null, 2);
						this.responseType = res.headers['content-type'].split(';')[0].split('/')[1];
						if (display && display != '0') {
							document.open();
							document.write(this.method.toUpperCase() === 'HEAD' ? this.resHead : this.response);
							document.close();
						}
						const blob = new Blob([this.resHead], {
							"type": "text/plain"
						});
						this.downloadUrl = URL.createObjectURL(blob);
					}
				} catch (err) {
					console.log(`错误信息：${JSON.stringify(err.response)}`);
					if (err.response?.data && err.response?.data instanceof Blob) {
						console.log('错误信息是blob对象');
						this.reader(err.response.data);
					} else {
						this.response = `出现错误：${JSON.stringify(err.message)}`
					}
					ElMessage.error('请求失败，请检查配置');
				}
			},
			handleResponse(response, display) {
				const contentType = response.headers['content-type'];
				this.contentType = contentType;
				const blob = new Blob([response.data], {
					type: contentType
				});
				const objectUrl = URL.createObjectURL(blob);

				if (contentType.includes('image')) {
					this.responseType = 'image';
					display && display != '0' ? location.href = objectUrl : true;
					this.responseUrl = objectUrl;
					this.downloadUrl = objectUrl;
				} else if (contentType.includes('video')) {
					this.responseType = 'video';
					display && display != '0' ? location.href = objectUrl : true;
					this.responseUrl = objectUrl;
					this.downloadUrl = objectUrl;
				} else if (contentType === 'audio/mpegurl' || contentType === 'application/vnd.apple.mpegurl') {
					//m3u8文件
					this.responseType = 'text';
					this.reader(response.data);
					this.downloadUrl = objectUrl;
				} else if (contentType.includes('audio')) {
					this.responseType = 'audio';
					display && display != '0' ? location.href = objectUrl : true;
					this.responseUrl = objectUrl;
					this.downloadUrl = objectUrl;
				} else if (
					contentType.includes('application/octet-stream') ||
					contentType.includes('application/zip')
				) {
					this.responseType = 'file';
					display && display != '0' ? location.href = objectUrl : true;
					this.responseUrl = objectUrl;
					this.downloadUrl = objectUrl; // 设置为可下载 URL
					this.responseFile = 'file.' + this.getFileExtension(this.url); //设置下载文件名
				} else if (contentType.includes('application/json')) {
					this.responseType = 'json';
					this.reader(response.data);
					this.downloadUrl = objectUrl;
				} else {
					this.responseType = 'text';
					this.reader(response.data);
					this.downloadUrl = objectUrl;
				}
			},
			downloadResponse() {
				const link = document.createElement('a');
				link.style.display = 'none';
				link.href = this.downloadUrl;
				// 根据响应类型设置下载文件名（默认后缀为txt）
				let fileName;
				if (this.contentType === 'application/octet-stream') {
					fileName = 'file.' + this.getFileExtension(this.url); //获取URL请求文件后缀
				} else if (this.contentType === 'audio/mpegurl' || this.contentType === 'application/vnd.apple.mpegurl') {
					fileName = 'file.m3u8';
				} else {
					fileName = `response.${this.contentType.split(';')[0].split('/')[1] || 'txt'}`;
				}
				link.download = fileName; // 设置下载文件名
				document.body.appendChild(link);
				link.click(); // 执行下载
				document.body.removeChild(link);
				//URL.revokeObjectURL(this.downloadUrl); // 释放临时 URL（添加这一行移动端取消下载再次尝试下载会失效）
			},
		},
	};
</script>

<style scoped>
	.container {
		display: flex;
		flex-direction: row;
	}

	.item {
		margin: 10px;
	}

	.el-row {
		margin-bottom: 10px;
	}

	.el-row:last-child {
		margin-bottom: 0;
	}

	pre {
		background: #f5f5f5;
		padding: 10px;
		border-radius: 4px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.backup {
		height: 100%;
		width: 100%;
		background-color: var(--el-bg-color-overlay);
		box-shadow: var(--el-box-shadow-lighter);
		text-align: center;
		line-height: 40px;
		color: #1989fa;
	}

	.button-group {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.button-item {
		width: 100%;
		margin-bottom: 10px;
	}

	.el-button+.el-button {
		margin-left: 0px;
	}

	@media (min-width: 768px) {
		.button-item {
			width: auto;
			margin-bottom: 0;
		}
	}
</style>