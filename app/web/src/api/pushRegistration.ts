type PushTokenReporter = (token: string) => void | Promise<void>;

let reporter: PushTokenReporter | null = null;

export function setPushTokenReporter(fn: PushTokenReporter): void {
	reporter = fn;
}

export async function reportPushToken(token: string): Promise<void> {
	if (!reporter) {
		console.info("[push] token 上报未配置", token.slice(0, 6));
		return;
	}
	await reporter(token);
}
