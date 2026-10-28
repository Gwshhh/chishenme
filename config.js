// 静态站点连接独立后端时填入完整的 HTTPS API 地址（以 /api/ 结尾）。
// 留空表示仅使用本地功能；Node 托管会自动提供同源 API 配置。
// 这里是公开配置，禁止填写地图密钥或其它服务端凭据。
export const APP_CONFIG = Object.freeze({
    apiBase: '',
    affiliate: { meituanCoupon: '', elemeCoupon: '' },
    sponsor: null,
});
