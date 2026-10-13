import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useTheme } from "@/context/ThemeContext"

const Toaster = ({ ...props }: ToasterProps) => {
  // ⚠ Read the APP's theme, not next-themes. This used to call `useTheme` from
  //   "next-themes", but no next-themes provider is ever mounted — the app has its own
  //   ThemeProvider — so it silently fell back to "system" and the toasts followed the
  //   OPERATING SYSTEM instead of the app. Pick midnight on a light-mode OS and the
  //   toasts rendered light.
  // ⚠ The app's values are light | midnight | eclipse; sonner understands only
  //   light | dark | system. Both dark themes map to "dark".
  const { theme } = useTheme()
  const sonnerTheme: ToasterProps["theme"] = theme === "light" ? "light" : "dark"

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
