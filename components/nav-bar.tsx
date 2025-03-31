export function NavBar() {
  const navItems = [
    { id: 1, name: "语意泛化" },
    { id: 2, name: "自动分析" },
    { id: 3, name: "解读设置" },
    { id: 4, name: "模型调整" },
    { id: 5, name: "语音识别" },
    { id: 6, name: "采集训练" },
  ]

  return (
    <nav className="header-gradient py-2 px-4 flex border-b justify-between">
      <div className="flex">
        {navItems.slice(0, 3).map((item) => (
          <NavItem key={item.id} name={item.name} active={item.id === 2} />
        ))}
      </div>
      <div className="flex">
        {navItems.slice(3).map((item) => (
          <NavItem key={item.id} name={item.name} />
        ))}
      </div>
    </nav>
  )
}

function NavItem({ name, active = false }: { name: string; active?: boolean }) {
  return (
    <div
      className={`nav-item px-5 py-1.5 mx-1 cursor-pointer rounded-md ${
        active ? "active text-white font-medium" : "text-white hover:bg-[var(--secondary)]/20"
      }`}
    >
      {name}
    </div>
  )
}

