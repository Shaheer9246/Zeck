"use client";

import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ChatSessionConfig } from "@/lib/chat-schema";
import { cn } from "@/lib/utils";

export const FRAMEWORK_PRESETS = [
	{
		value: "auto",
		label: "Auto-detect",
		hint: "Let Cline inspect the workspace",
	},
	{ value: "react", label: "React", hint: "Component-based web app" },
	{ value: "next", label: "Next.js", hint: "Full-stack React app" },
	{ value: "vue", label: "Vue", hint: "Vue application" },
	{ value: "angular", label: "Angular", hint: "Angular application" },
	{ value: "python", label: "Python", hint: "Python project or script" },
	{ value: "node", label: "Node.js", hint: "Node service or tool" },
	{ value: "html", label: "HTML / CSS", hint: "Static browser preview" },
] as const;

export type FrameworkPreset = (typeof FRAMEWORK_PRESETS)[number]["value"];

export function frameworkPromptAddendum(framework: FrameworkPreset): string {
	if (framework === "auto") return "";
	const label = FRAMEWORK_PRESETS.find(
		(preset) => preset.value === framework,
	)?.label;
	return label
		? `Build and run this project as a ${label} project. Prefer the existing project conventions and use the appropriate development or preview command for that framework.`
		: "";
}

type SessionSetupPanelProps = {
	provider: string;
	model: string;
	isBusy: boolean;
	onProviderChange: (provider: string) => void;
	onModelChange: (model: string) => void;
	modelSelector: ReactNode;
	framework: FrameworkPreset;
	onFrameworkChange: (framework: FrameworkPreset) => void;
	sessionInstructions: string;
	onSessionInstructionsChange: (instructions: string) => void;
	microphoneDeviceId: string;
	onMicrophoneDeviceChange: (deviceId: string) => void;
	autoApproveTools: boolean;
	onAutoApproveChange: (enabled: boolean) => void;
	mode: ChatSessionConfig["mode"];
	onModeToggle: () => void;
};

export function SessionSetupPanel({
	provider,
	model,
	isBusy,
	modelSelector,
	framework,
	onFrameworkChange,
	sessionInstructions,
	onSessionInstructionsChange,
	microphoneDeviceId,
	onMicrophoneDeviceChange,
	autoApproveTools,
	onAutoApproveChange,
	mode,
	onModeToggle,
}: SessionSetupPanelProps) {
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

	useEffect(() => {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		void navigator.mediaDevices.enumerateDevices().then((allDevices) => {
			setDevices(allDevices.filter((device) => device.kind === "audioinput"));
		});
	}, []);

	return (
		<section className="mt-3 rounded-lg border border-border/80 bg-background/70 p-3 text-sm shadow-sm">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<h2 className="font-medium text-foreground">Chat setup</h2>
					<p className="text-xs text-muted-foreground">
						Applies to this session only
					</p>
				</div>
				<Settings2 className="size-4 text-muted-foreground" />
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">
						Provider and model
					</div>
					<div
						className={cn(
							"rounded-md border border-border/70 bg-muted/20 px-2",
							isBusy && "opacity-60",
						)}
					>
						{modelSelector}
					</div>
					<p className="text-[11px] text-muted-foreground">
						{provider} · {model}
					</p>
				</div>

				<div className="space-y-2">
					<label
						className="text-xs font-medium text-muted-foreground"
						htmlFor="session-framework"
					>
						Framework
					</label>
					<Select
						disabled={isBusy}
						onValueChange={(value) =>
							onFrameworkChange(value as FrameworkPreset)
						}
						value={framework}
					>
						<SelectTrigger id="session-framework" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{FRAMEWORK_PRESETS.map((preset) => (
								<SelectItem key={preset.value} value={preset.value}>
									{preset.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="mt-3 space-y-2">
				<label
					className="text-xs font-medium text-muted-foreground"
					htmlFor="session-instructions"
				>
					Custom instructions
				</label>
				<Textarea
					className="min-h-20 resize-y bg-background/60 text-sm"
					disabled={isBusy}
					id="session-instructions"
					onChange={(event) => onSessionInstructionsChange(event.target.value)}
					placeholder="For this chat only: describe the style, constraints, or workflow you want Cline to follow."
					value={sessionInstructions}
				/>
			</div>

			<div className="mt-3 grid gap-3 md:grid-cols-3">
				<div className="space-y-2">
					<label
						className="text-xs font-medium text-muted-foreground"
						htmlFor="session-microphone"
					>
						Microphone source
					</label>
					<Select
						disabled={isBusy}
						onValueChange={onMicrophoneDeviceChange}
						value={microphoneDeviceId}
					>
						<SelectTrigger id="session-microphone" className="w-full">
							<SelectValue placeholder="Default microphone" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="default">Default microphone</SelectItem>
							{devices.map((device, index) => (
								<SelectItem key={device.deviceId} value={device.deviceId}>
									{device.label || `Microphone ${index + 1}`}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<span className="block text-xs font-medium text-muted-foreground">
						Mode
					</span>
					<Button
						className="w-full justify-between"
						disabled={isBusy}
						onClick={onModeToggle}
						type="button"
						variant="outline"
					>
						<span>{mode === "act" ? "Act" : "Plan"}</span>
						<span className="text-xs text-muted-foreground">Change</span>
					</Button>
				</div>
				<div className="space-y-2">
					<span className="block text-xs font-medium text-muted-foreground">
						Tool approvals
					</span>
					<Button
						aria-pressed={autoApproveTools}
						className="w-full justify-between"
						disabled={isBusy}
						onClick={() => onAutoApproveChange(!autoApproveTools)}
						type="button"
						variant="outline"
					>
						<span>
							{autoApproveTools ? "Auto-approve on" : "Ask before tools"}
						</span>
						<span className="text-xs text-muted-foreground">Toggle</span>
					</Button>
				</div>
			</div>
		</section>
	);
}
