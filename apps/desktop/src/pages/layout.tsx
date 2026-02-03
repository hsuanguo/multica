import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useHubInit, useGatewayStore, useHubStore, clearConnection } from '@multica/store'
import { Toaster } from '@multica/ui/components/ui/sonner'
import { Button } from '@multica/ui/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Settings02Icon,
  Home01Icon,
  CodeIcon,
  PlugIcon,
  Comment01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@multica/ui/lib/utils'

const tabs = [
  { path: '/', label: 'Home', icon: Home01Icon, exact: true },
  { path: '/chat', label: 'Chat', icon: Comment01Icon },
  { path: '/tools', label: 'Tools', icon: CodeIcon },
  { path: '/skills', label: 'Skills', icon: PlugIcon },
]

export default function Layout() {
  useHubInit()
  const location = useLocation()

  const gwState = useGatewayStore((s) => s.connectionState)
  const hubId = useGatewayStore((s) => s.hubId)
  const activeAgentId = useHubStore((s) => s.activeAgentId)
  const isConnected = gwState === 'registered' && !!hubId && !!activeAgentId

  const handleDisconnect = () => {
    useGatewayStore.getState().disconnect()
    useHubStore.getState().reset()
    clearConnection()
  }

  return (
    <div className="h-dvh flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Multica</span>
        </div>
        <div className="flex items-center gap-1">
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              className="text-xs text-muted-foreground"
            >
              Disconnect
            </Button>
          )}
          <Button variant="ghost" size="icon">
            <HugeiconsIcon icon={Settings02Icon} className="size-5" />
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 px-4 py-2 border-b">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? location.pathname === tab.path
            : location.pathname.startsWith(tab.path)

          return (
            <NavLink key={tab.path} to={tab.path}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('gap-2', isActive && 'bg-secondary')}
              >
                <HugeiconsIcon icon={tab.icon} className="size-4" />
                {tab.label}
              </Button>
            </NavLink>
          )
        })}
      </nav>

      {/* Content */}
      <main className={cn('flex-1 overflow-auto', location.pathname === '/chat' ? '' : 'p-4')}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
