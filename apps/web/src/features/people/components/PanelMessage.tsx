type Props = { children: string };

export function PanelMessage({ children }: Props) {
  return children ? <p role="status">{children}</p> : null;
}
