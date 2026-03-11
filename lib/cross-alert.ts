/**
 * Cross-platform alert utility.
 * On native (iOS/Android): uses React Native's Alert.alert() for native dialogs.
 * On web: uses window.confirm() / window.alert() which work in browsers.
 */
import { Alert, Platform } from "react-native";

type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

/**
 * Show a cross-platform alert dialog.
 * On web, maps to window.alert() or window.confirm().
 * On native, uses React Native Alert.
 */
export function crossAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  // Web fallback
  const fullMessage = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length <= 1) {
    // Simple alert
    window.alert(fullMessage);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Find confirm and cancel buttons
  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const confirmBtn = buttons.find((b) => b.style !== "cancel");

  if (cancelBtn && confirmBtn) {
    const confirmed = window.confirm(fullMessage);
    if (confirmed) {
      confirmBtn.onPress?.();
    } else {
      cancelBtn.onPress?.();
    }
  } else {
    // Multiple non-cancel buttons — just show alert and call first
    window.alert(fullMessage);
    buttons[0]?.onPress?.();
  }
}

/**
 * Show a simple info alert (no buttons needed).
 */
export function crossInfo(title: string, message?: string): void {
  crossAlert(title, message, [{ text: "OK" }]);
}

/**
 * Show a confirmation dialog. Returns a promise that resolves to true if confirmed.
 * On web uses window.confirm(). On native uses Alert.alert().
 */
export function crossConfirm(
  title: string,
  message?: string,
  confirmText = "OK",
  cancelText = "Cancel"
): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web") {
      Alert.alert(title, message, [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        { text: confirmText, onPress: () => resolve(true) },
      ]);
    } else {
      const fullMessage = message ? `${title}\n\n${message}` : title;
      const confirmed = window.confirm(fullMessage);
      resolve(confirmed);
    }
  });
}
