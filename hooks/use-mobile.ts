import * as React from "react"

const MOBILE_BREAKPOINT = 768
const WIDE_DESKTOP_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/** Desktop largo: editor de lados entra na aba Confrontações (não no painel lateral). */
export function useIsWideDesktop() {
  const [isWide, setIsWide] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`).matches
      : false,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`)
    const onChange = () => {
      setIsWide(mql.matches)
    }
    mql.addEventListener("change", onChange)
    setIsWide(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isWide
}
