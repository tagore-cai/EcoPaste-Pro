import clsx from "clsx";
import { forwardRef, type HTMLAttributes } from "react";

export interface UnoIconProps extends HTMLAttributes<HTMLElement> {
  name?: string;
  size?: number;
  color?: string;
  active?: boolean;
  hoverable?: boolean;
}

const UnoIcon = forwardRef<HTMLElement, UnoIconProps>((props, ref) => {
  const { name, className, size, color, active, hoverable, style, ...rest } =
    props;

  return (
    <i
      {...rest}
      className={clsx(name, className, "inline-flex", {
        "cursor-pointer transition hover:text-primary": hoverable,
        "text-primary": active,
      })}
      ref={ref}
      style={{
        color,
        height: size,
        width: size,
        ...style,
      }}
    />
  );
});

export default UnoIcon;
