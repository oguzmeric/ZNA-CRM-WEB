import { useState } from 'react'
import {
  LayoutDashboard, Users, Phone, CheckSquare, Calendar, Package, TrendingUp,
  KeyRound, Wrench, Truck, FolderOpen, BarChart3, MessageSquare, UserCog,
  Activity, LogOut, AlertTriangle, Bell, Palette, Search, Plus, ArrowRight,
  FileText, Pencil, Trash2, RefreshCw,
} from 'lucide-react'
import {
  Button, Input, SearchInput, Textarea, Select, Label,
  Card, CardTitle, CardSubtitle, KPICard,
  Badge, CriticalBadge, CodeBadge,
  Table, THead, TBody, TR, TH, TD,
  Alert,
  Sidebar, SidebarBrand, SidebarSection, SidebarItem,
  Topbar, IconButton, StatusPill,
  SegmentedControl,
  Modal,
  Avatar,
  EmptyState,
  Timeline, TimelineItem,
  CurrencyBox,
} from '../components/ui'

const Section = ({ title, children }) => (
  <section style={{ marginBottom: 40 }}>
    <h2 className="t-h2" style={{ marginBottom: 16 }}>{title}</h2>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      {children}
    </div>
  </section>
)

export default function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [segment, setSegment] = useState('hepsi')
  const [tab, setTab] = useState('tumu')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-bg)' }}>
      {/* Sidebar örneği */}
      <Sidebar>
        <SidebarBrand
          logo={<div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--brand-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>Z</div>}
          title="ZNA Teknoloji"
          subtitle="Yönetim sistemi"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-on-dark)' }}>
          <Avatar name="Ali Uğur Aktepe" size="sm" onDark />
          <div>
            <div style={{ color: 'var(--text-on-dark)', font: '500 13px/18px var(--font-sans)' }}>Ali Uğur Aktepe</div>
            <div style={{ color: 'var(--text-on-dark-muted)', font: '400 12px/16px var(--font-sans)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
              Çevrimiçi
            </div>
          </div>
        </div>
        <SidebarSection>
          <SidebarItem to="/design-system" icon={<LayoutDashboard size={16} strokeWidth={1.5} />} end>Panel</SidebarItem>
          <SidebarItem to="#musteriler" icon={<Users size={16} strokeWidth={1.5} />}>Müşteriler</SidebarItem>
          <SidebarItem to="#gorevler" icon={<CheckSquare size={16} strokeWidth={1.5} />}>Görevler</SidebarItem>
          <SidebarItem to="#gorusmeler" icon={<Phone size={16} strokeWidth={1.5} />}>Görüşmeler</SidebarItem>
          <SidebarItem to="#takvim" icon={<Calendar size={16} strokeWidth={1.5} />}>Takvim</SidebarItem>
          <SidebarItem to="#stok" icon={<Package size={16} strokeWidth={1.5} />}>Stok</SidebarItem>
          <SidebarItem to="#satislar" icon={<TrendingUp size={16} strokeWidth={1.5} />}>Satışlar</SidebarItem>
          <SidebarItem to="#lisanslar" icon={<KeyRound size={16} strokeWidth={1.5} />}>Trassir Lisanslar</SidebarItem>
          <SidebarItem to="#servis" icon={<Wrench size={16} strokeWidth={1.5} />}>Servis</SidebarItem>
          <SidebarItem to="#kargo" icon={<Truck size={16} strokeWidth={1.5} />}>Kargo Takip</SidebarItem>
          <SidebarItem to="#dokuman" icon={<FolderOpen size={16} strokeWidth={1.5} />}>Doküman Merkezi</SidebarItem>
          <SidebarItem to="#raporlar" icon={<BarChart3 size={16} strokeWidth={1.5} />}>Raporlar</SidebarItem>
          <SidebarItem to="#mesajlar" icon={<MessageSquare size={16} strokeWidth={1.5} />}>Mesajlar</SidebarItem>
          <SidebarItem to="#kullanicilar" icon={<UserCog size={16} strokeWidth={1.5} />}>Kullanıcılar</SidebarItem>
          <SidebarItem to="#performans" icon={<Activity size={16} strokeWidth={1.5} />}>Performans</SidebarItem>
          <SidebarItem to="#cikis" icon={<LogOut size={16} strokeWidth={1.5} />}>Çıkış</SidebarItem>
        </SidebarSection>
      </Sidebar>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Design System">
          <CurrencyBox code="USD" value="44,92" onRefresh={() => {}} />
          <CurrencyBox code="EUR" value="52,71" onRefresh={() => {}} />
          <IconButton ariaLabel="Bildirimler"><Bell size={20} strokeWidth={1.5} /></IconButton>
          <IconButton ariaLabel="Tema"><Palette size={20} strokeWidth={1.5} /></IconButton>
          <StatusPill tone="success">Çevrimiçi</StatusPill>
        </Topbar>

        <main style={{ padding: 24, maxWidth: 1440 }}>
          <h1 className="t-h1" style={{ marginBottom: 4 }}>ZNA Design System</h1>
          <p className="t-caption" style={{ marginBottom: 32 }}>Kurumsal component kütüphanesi — Faz 3</p>

          <Section title="Tipografi">
            <Card style={{ flex: 1, minWidth: 320 }}>
              <div className="t-display" style={{ marginBottom: 8 }}>28/36 Display</div>
              <div className="t-h1" style={{ marginBottom: 8 }}>20/28 H1 Sayfa başlığı</div>
              <div className="t-h2" style={{ marginBottom: 8 }}>16/24 H2 Bölüm başlığı</div>
              <div className="t-body" style={{ marginBottom: 4 }}>14/20 Body — standart metin</div>
              <div className="t-body-strong" style={{ marginBottom: 4 }}>14/20 Body strong</div>
              <div className="t-caption" style={{ marginBottom: 4 }}>12/16 Caption</div>
              <div className="t-label" style={{ marginBottom: 4 }}>12/16 LABEL</div>
              <div className="t-mono">12/16 Mono AK320.01.043</div>
            </Card>
          </Section>

          <Section title="Buttons">
            <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />}>Yeni müşteri</Button>
            <Button variant="secondary">İkincil</Button>
            <Button variant="tertiary">Üçüncül</Button>
            <Button variant="danger" iconLeft={<Trash2 size={14} strokeWidth={1.5} />}>Sil</Button>
            <Button variant="primary" size="sm">Küçük</Button>
            <Button variant="primary" size="lg">Büyük</Button>
            <Button variant="primary" disabled>Devre dışı</Button>
          </Section>

          <Section title="Form alanları">
            <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label htmlFor="ds-name" required>Ad Soyad</Label>
                <Input id="ds-name" placeholder="Ahmet Yılmaz" />
              </div>
              <div>
                <Label>Arama</Label>
                <SearchInput placeholder="Müşteri ara…" />
              </div>
              <div>
                <Label>Durum</Label>
                <Select defaultValue="aktif">
                  <option value="aktif">Aktif</option>
                  <option value="lead">Lead</option>
                  <option value="pasif">Pasif</option>
                </Select>
              </div>
              <div>
                <Label>Notlar</Label>
                <Textarea placeholder="Notlarınızı yazın…" />
              </div>
            </div>
          </Section>

          <Section title="KPI Kartlar">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, width: '100%' }}>
              <KPICard
                label="TOPLAM MÜŞTERİ"
                value="1.756"
                icon={<Users size={16} strokeWidth={1.5} />}
                footer={<><TrendingUp size={12} strokeWidth={1.5} /> 1.756 aktif · son 30 gün</>}
              />
              <KPICard
                label="BU AY GÖRÜŞME"
                value="328"
                icon={<Phone size={16} strokeWidth={1.5} />}
                footer={<><TrendingUp size={12} strokeWidth={1.5} /> +%12 geçen ay</>}
              />
              <KPICard
                label="AKTİF LİSANS"
                value="412"
                icon={<KeyRound size={16} strokeWidth={1.5} />}
                footer={<span style={{ color: 'var(--text-tertiary)' }}>12 lisans 30 gün içinde bitiyor</span>}
              />
              <KPICard
                label="TOPLAM TEKLİF"
                value="89"
                icon={<FileText size={16} strokeWidth={1.5} />}
                footer={<span style={{ color: 'var(--text-tertiary)' }}>14'ü beklemede</span>}
              />
            </div>
          </Section>

          <Section title="Badges">
            <Badge tone="aktif">Aktif</Badge>
            <Badge tone="lead">Lead</Badge>
            <Badge tone="pasif">Pasif</Badge>
            <Badge tone="kayip">Kayıp</Badge>
            <Badge tone="beklemede">Beklemede</Badge>
            <Badge tone="acik">Açık</Badge>
            <Badge tone="kapali">Kapalı</Badge>
            <Badge tone="brand">Yeni</Badge>
            <CriticalBadge>Vadesi geçti</CriticalBadge>
            <CodeBadge>AK320.01.043</CodeBadge>
            <CodeBadge>ACT-00009</CodeBadge>
          </Section>

          <Section title="Segmented Control">
            <SegmentedControl
              options={[
                { value: 'hepsi', label: 'Hepsi', count: 1756 },
                { value: 'aktif', label: 'Aktif', count: 1204 },
                { value: 'lead', label: 'Lead', count: 312 },
                { value: 'pasif', label: 'Pasif', count: 180 },
                { value: 'kayip', label: 'Kayıp', count: 60 },
              ]}
              value={segment}
              onChange={setSegment}
            />
          </Section>

          <Section title="Alerts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <Alert
                variant="danger"
                title={<>1 gecikmiş fatura <CriticalBadge style={{ marginLeft: 8 }}>Vadesi geçti</CriticalBadge></>}
                action={<a href="#" style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Görüntüle <ArrowRight size={14} /></a>}
              >
                Toplam 757,20 ₺ tahsil edilmeyi bekliyor — FAT-2026-001
              </Alert>
              <Alert variant="warning" title="12 lisans 30 gün içinde bitiyor">
                Yenilenmesi gereken lisansları listeden görebilirsiniz.
              </Alert>
              <Alert variant="info" title="Yeni sürüm yayında">
                Sürüm notlarını okumak için tıklayın.
              </Alert>
              <Alert variant="success" title="Yedekleme başarılı">
                Veritabanı yedeği 03:00'te tamamlandı.
              </Alert>
            </div>
          </Section>

          <Section title="Table">
            <div style={{ width: '100%' }}>
              <Table>
                <THead>
                  <tr>
                    <TH>Müşteri</TH>
                    <TH>Kod</TH>
                    <TH>Durum</TH>
                    <TH align="right">Son görüşme</TH>
                    <TH align="right">İşlem</TH>
                  </tr>
                </THead>
                <TBody>
                  {[
                    { ad: 'Akın Elektronik', kod: 'AK320.01.043', durum: 'aktif', tarih: '22.04.2026' },
                    { ad: 'Delta Güvenlik', kod: 'DE101.02.011', durum: 'lead', tarih: '19.04.2026' },
                    { ad: 'Pars Teknoloji', kod: 'PA455.08.102', durum: 'pasif', tarih: '04.03.2026' },
                  ].map((r, i) => (
                    <TR key={i} onClick={() => {}}>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.ad} size="sm" />
                          <span>{r.ad}</span>
                        </div>
                      </TD>
                      <TD><CodeBadge>{r.kod}</CodeBadge></TD>
                      <TD><Badge tone={r.durum}>{r.durum[0].toUpperCase() + r.durum.slice(1)}</Badge></TD>
                      <TD align="right">{r.tarih}</TD>
                      <TD align="right">
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <IconButton ariaLabel="Düzenle"><Pencil size={14} strokeWidth={1.5} /></IconButton>
                          <IconButton ariaLabel="Sil"><Trash2 size={14} strokeWidth={1.5} /></IconButton>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Section>

          <Section title="Empty State & Timeline">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%' }}>
              <EmptyState
                icon={<FileText size={32} strokeWidth={1.5} />}
                title="Henüz görev eklenmedi"
                description="Yukarıdaki butona tıklayarak ilk görevi oluşturabilirsiniz."
                action={<Button variant="primary" size="sm" iconLeft={<Plus size={14} />}>Yeni görev</Button>}
              />
              <Card>
                <CardTitle>Firma geçmişi</CardTitle>
                <CardSubtitle>Son etkinlikler</CardSubtitle>
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'tumu', label: 'Tümü' },
                    { value: 'gorusme', label: 'Görüşmeler' },
                    { value: 'teklif', label: 'Teklifler' },
                  ]}
                  value={tab}
                  onChange={setTab}
                  style={{ marginBottom: 16 }}
                />
                <Timeline>
                  <TimelineItem
                    active
                    icon={<Phone size={14} strokeWidth={1.5} />}
                    title="Telefon görüşmesi"
                    meta="22.04.2026 · 14:30"
                  >
                    Yeni teklif için bilgi alındı. Takip görüşmesi planlandı.
                  </TimelineItem>
                  <TimelineItem
                    icon={<FileText size={14} strokeWidth={1.5} />}
                    title="Teklif oluşturuldu"
                    meta="18.04.2026"
                  >
                    12 kalem, toplam 48.250 ₺
                  </TimelineItem>
                  <TimelineItem
                    icon={<CheckSquare size={14} strokeWidth={1.5} />}
                    title="Görev tamamlandı"
                    meta="11.04.2026"
                  >
                    Saha montajı tamamlandı.
                  </TimelineItem>
                </Timeline>
              </Card>
            </div>
          </Section>

          <Section title="Modal">
            <Button variant="primary" onClick={() => setModalOpen(true)}>Modal'ı aç</Button>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="Yeni müşteri"
              footer={
                <>
                  <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
                  <Button variant="primary" onClick={() => setModalOpen(false)}>Kaydet</Button>
                </>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <Label required>Firma adı</Label>
                  <Input placeholder="Firma adını yazın" />
                </div>
                <div>
                  <Label>Durum</Label>
                  <Select>
                    <option>Aktif</option>
                    <option>Lead</option>
                  </Select>
                </div>
              </div>
            </Modal>
          </Section>
        </main>
      </div>
    </div>
  )
}
