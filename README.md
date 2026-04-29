# 💾 HD Manager

Mova programas e jogos do SSD para o HD externo sem que o Windows perceba a diferença.  
Usa **Junction Points** (symlinks de diretório) para que o programa continue funcionando no local original, mas os arquivos fiquem fisicamente no HD.

---

## ▶️ Como instalar e abrir

**Dê duplo clique em `instalar-e-abrir.bat`** — ele faz tudo automaticamente:

1. Configura permissões do PowerShell
2. Instala as dependências (`npm install`) — só na primeira vez
3. Abre o app (`npm start`)

> ⚠️ **Execute como Administrador** para que as operações de Junction funcionem corretamente.  
> Clique com botão direito em `instalar-e-abrir.bat` → **Executar como administrador**

---

## 📋 Funcionalidades

### 📦 Mover para HD
- Lista todos os programas instalados no Windows (via registro)
- Mostra localização, versão e tamanho estimado
- Permite mover um ou vários programas de uma vez
- Cria um Junction no lugar original → o programa continua funcionando normalmente
- Verifica espaço livre antes de mover

### ✅ Já no HD
- Lista todos os programas já movidos (pasta `Programas_HD` no HD)
- Mostra tamanho real no HD
- Botão para abrir a pasta no Explorer
- Botão ↩️ para **restaurar** o programa de volta ao SSD

### 🔧 Instalar no HD
- Redireciona a pasta padrão `Program Files` do Windows para o HD
- Novos programas instalados via `.exe` padrão vão direto para o HD
- Detecta Steam e Epic Games e exibe instruções para configurar bibliotecas
- Botão para **restaurar** as pastas padrão de volta ao SSD

---

## ⚙️ Como funciona por dentro

```
Antes:  C:\Program Files\MeuJogo\   (arquivos reais no SSD)

Depois: C:\Program Files\MeuJogo\   (Junction — aponta para →)
        E:\Programas_HD\MeuJogo\    (arquivos reais no HD)
```

O Windows e os programas enxergam `C:\Program Files\MeuJogo\` normalmente.  
Os arquivos ficam fisicamente em `E:\Programas_HD\MeuJogo\`.

---

## ⚠️ Requisitos e avisos

| Requisito | Detalhe |
|---|---|
| **Windows 10 ou 11** | Necessário para NTFS Junctions |
| **Node.js instalado** | Download em [nodejs.org](https://nodejs.org) |
| **Executar como Administrador** | Necessário para criar Junctions e alterar registro |
| **HD sempre conectado** | O programa falha se o HD for desconectado enquanto em uso |
| **Fechar o programa antes de mover** | Arquivos em uso não podem ser copiados/removidos |

---

## 🗂️ Estrutura do projeto

```
hd-manager-fixed/
├── instalar-e-abrir.bat     ← Execute este para iniciar
├── main.js                  ← Processo principal Electron (IPC + PowerShell)
├── renderer.js              ← Interface do usuário (lógica do frontend)
├── index.html               ← HTML + CSS da interface
├── package.json
└── scripts/
    ├── move-to-hd.ps1       ← Copia para HD e cria Junction
    ├── restore-to-ssd.ps1   ← Remove Junction e copia de volta ao SSD
    ├── set-install-dir.ps1  ← Redireciona Program Files para o HD
    └── restore-install-dir.ps1 ← Restaura Program Files para o SSD
```

---

## 🐛 Solução de problemas

**App abre mas não mostra discos ou programas**
- Execute como Administrador
- Verifique se o PowerShell está disponível: abra o CMD e digite `powershell -version`

**"Não foi possível criar Junction"**
- Execute o app como Administrador obrigatoriamente

**"Espaço insuficiente"**
- Verifique o espaço livre no HD antes de mover

**Programa parou de funcionar após mover**
- O HD foi desconectado? Reconecte e tente novamente
- Use a opção ↩️ na aba "Já no HD" para restaurar ao SSD

**npm não é reconhecido**
- Instale o Node.js em [nodejs.org](https://nodejs.org) e reinicie o computador

---

## 🔄 Histórico de correções (v2.1)

- Reescrita da execução PowerShell: usa arquivos `.ps1` temporários em vez de inline, eliminando erros de escaping que impediam discos/programas de aparecer
- Corrigido `restoreInstallDir()` que chamava handler errado
- Adicionado botão ↩️ Restaurar na aba "Já no HD"
- Handler `restore-install-dir` adicionado ao processo principal
- Stats da home (`programas movidos`, `espaço liberado`) carregam ao iniciar
- Removida referência a `icon.png` inexistente
- Tolerância de verificação de integridade: 2% em vez de fixo 2 arquivos
- Criação de Junction mais robusta (tenta `New-Item` antes de `mklink`)
- `.bat` de inicialização com bypass automático do PowerShell
