# AGENTS.md

## 1. Project Rule

本專案為 2D Shooting Game。

AI Agent 修改任何程式碼前，必須先理解目前架構與既有功能。

最高原則：

> **新增功能不能破壞既有功能。**
>
> **重構只能改變程式結構，不得未經要求改變遊戲行為。**

---

# 2. Existing Function Preservation

任何修改都必須盡可能保留既有功能。

特別禁止因新增或修改其他系統而遺失：

* Player movement
* Shooting
* Weapon switching
* Reload
* Ammo
* Damage
* Death
* Bot
* Projectile / Bullet
* Inventory
* Backpack
* Stash
* Equipment
* Loot
* Loot display
* Item pickup
* Item drop
* Drag & Drop
* Double-click Quick Transfer
* Item rotation
* Extraction
* Game timer
* Multiplayer / WebSocket
* UI interactions

如果某功能目前存在，除非使用者明確要求移除，否則不得刪除或改變。

---

# 3. Before Modification

開始修改前必須：

1. 閱讀相關檔案。
2. 搜尋相關 function / class / state / event。
3. 搜尋所有 references。
4. 確認修改會影響哪些系統。
5. 判斷是否存在既有功能依賴。

不得看到一個檔案就直接重寫。

---

# 4. Small Changes

優先採用：

```text
small change
→ test
→ verify
→ next change
```

禁止一次：

```text
rewrite entire project
rewrite entire system
rewrite large unrelated files
```

大型任務必須拆成多個小階段。

---

# 5. No Unrequested Changes

如果使用者要求：

```text
新增 A
```

不得順便修改：

```text
B
C
D
```

除非 B/C/D 是完成 A 所必要。

以下修改必須避免：

* 無關 UI redesign
* 無關 CSS 修改
* 無關遊戲數值調整
* 無關效能最佳化
* 無關檔案重構
* 無關命名大改
* 無關 dependency 更新

---

# 6. Refactoring Rule

重構的目的：

```text
降低耦合
建立清楚責任
減少重複程式
改善可維護性
```

重構不得自行改變：

```text
遊戲規則
遊戲數值
操作方式
UI 行為
物理行為
戰鬥結果
Inventory 行為
Loot 行為
```

除非使用者明確要求。

---

# 7. Architecture

專案逐步朝以下責任分離：

```text
core/
    Game
    GameLoop
    GameState

gameplay/
    Player
    Weapon
    Projectile
    Combat

inventory/
    Inventory
    Container
    Item
    Equipment
    InventoryRules

loot/
    LootSystem
    LootContainer
    LootTable

rendering/
    Renderer
    Camera
    WebGPU

input/
    InputManager

networking/
    NetworkManager
    Protocol
    StateSync

ui/
    UIManager
    InventoryUI
    LootUI
    EquipmentUI
    HUD

data/
    weapons
    items
    maps
```

這是長期架構方向。

**不要為了符合這個目錄結構而強行拆檔。**

實際程式碼結構優先。

---

# 8. Core Principle

GameState 應逐步成為正式遊戲狀態唯一來源。

不要建立多份互相獨立的：

```text
players
bullets
bots
loot
inventory
game timer
game state
```

如果發現重複 state：

1. 先確認用途。
2. 確認 references。
3. 再逐步整合。
4. 確認沒有 references 後才能刪除舊 state。

禁止直接刪除看似沒有使用的 state。

---

# 9. System Separation

### Gameplay

Gameplay 負責遊戲規則。

不得依賴：

```text
DOM
UI
WebGPU
```

### UI

UI 負責：

```text
display
input
visual feedback
```

UI 不應自行實作遊戲規則。

例如 Inventory UI 不應自行決定：

```text
物品是否合法
物品是否能放入
物品應該移動到哪裡
```

這些應由 Inventory System 決定。

### Renderer

Renderer 負責顯示 GameState。

Renderer 不應自行修改：

```text
health
inventory
damage
loot
weapon stats
```

### Input

Input 負責取得使用者操作。

不要讓 Input layer 直接修改大量 GameState。

### Networking

Networking 負責：

```text
communication
serialization
state synchronization
```

不要將 WebSocket 邏輯散落到 Gameplay。

---

# 10. Inventory Rule

Inventory 是核心系統。

以下功能視為既有功能，必須持續保留：

```text
Drag & Drop
Double-click Quick Transfer
Item Rotation
Placement Validation
Backpack
Stash
Equipment
Loot Transfer
```

未來新增：

```text
Chest Rig
Container
Secure Container
```

時，應優先共用：

```text
Inventory
Container
InventoryRules
```

而不是建立完全獨立的一套 Inventory 邏輯。

---

# 11. UI / Gameplay Boundary

禁止：

```text
UI
 ↓
直接修改大量遊戲 state
```

優先：

```text
UI
 ↓
System / Command
 ↓
GameState
```

例如：

```text
Double-click Item
↓
InventoryUI
↓
Inventory.transferItem()
↓
GameState
```

而不是：

```text
Double-click Item
↓
InventoryUI
↓
直接修改所有 inventory data
```

---

# 12. Data / Logic Separation

遊戲資料與遊戲邏輯逐步分離。

例如：

```text
data/weapons
        ↓
Weapon system
```

不要將大量固定遊戲資料散落在：

```text
UI
main.js
game_simulation.js
```

但是不要在沒有必要時進行大型資料層重構。

---

# 13. Dependencies

避免：

```text
A → B → C → A
```

也就是 circular dependency。

修改前確認 import/export 關係。

如果發現 circular dependency：

* 不要使用 hack。
* 先分析責任邊界。
* 只在與目前任務直接相關時修復。

---

# 14. Feature Development Rule

未來新增功能時：

## Step 1

先搜尋：

```text
existing implementation
existing state
existing UI
existing events
existing functions
```

## Step 2

確認新功能是否可以使用既有 system。

## Step 3

優先擴充既有 system。

## Step 4

只有確定沒有合適 system 時才建立新的 system。

---

# 15. Feature Isolation

新增功能必須盡量隔離。

例如新增：

```text
Chest Rig
```

不得因此重寫：

```text
Inventory
Loot
Backpack
Stash
Equipment
```

除非確實必要。

如果需要修改既有系統：

```text
minimal modification
```

優先。

---

# 16. Do Not Delete Existing Code Without Verification

禁止因為：

```text
看起來沒使用
看起來重複
看起來舊
```

就直接刪除。

刪除前必須搜尋 references。

確認：

```text
0 references
```

或確認該程式碼確實由新實作完整取代。

---

# 17. Testing

每次修改後至少確認：

```text
Application starts
No new console errors
Existing core gameplay works
```

涉及 Inventory 時必須測試：

```text
Drag & Drop
Double-click Quick Transfer
Item Rotation
Pickup
Drop
```

涉及 Combat 時必須測試：

```text
Shooting
Hit
Damage
Death
```

涉及 UI 時必須實際開啟 UI 驗證。

---

# 18. Git Safety

修改前確認：

```bash
git status
```

修改後確認：

```bash
git status
git diff --stat
git diff
```

檢查：

```text
沒有意外刪除
沒有無關修改
沒有大量格式化
沒有遊戲數值變化
```

不要覆蓋使用者尚未提交的修改。

如果發現工作區原本已有修改：

**不要自行 reset、checkout、restore 或覆蓋。**

---

# 19. Large Task Protocol

如果任務涉及大量修改：

先輸出：

```text
Plan:
1. ...
2. ...
3. ...

Files affected:
- ...

Existing features at risk:
- ...

Testing plan:
- ...
```

取得使用者確認後再進行大型修改。

---

# 20. Refactoring Protocol

重構必須：

```text
Inspect
↓
Plan
↓
Small extraction
↓
Test
↓
Review diff
↓
Continue
```

不要：

```text
Inspect
↓
Rewrite everything
↓
Hope it works
```

---

# 21. Error Handling

如果修改後發現既有功能消失：

立即：

1. 停止繼續修改。
2. 找出是哪次修改造成。
3. 修復或還原該部分。
4. 再重新實作目前任務。

不要用更多修改掩蓋問題。

---

# 22. Performance

沒有測量前，不要進行大型效能最佳化。

流程：

```text
Measure
↓
Identify bottleneck
↓
Optimize
↓
Measure again
```

不要因為「可能比較快」就重寫架構。

---

# 23. Code Style

優先遵守目前 repository 已有：

```text
命名
格式
module style
coding style
```

不要在一次修改中順便統一整個 repository 格式。

---

# 24. Final Verification

完成任務前必須檢查：

```text
[ ] Requested feature works
[ ] Existing features still work
[ ] No unrelated feature changed
[ ] No unexpected files changed
[ ] No accidental deletion
[ ] No new console errors
[ ] Git diff reviewed
```

---

# 25. Final Report

完成任務後簡潔回報：

```text
Changed:
- ...

Files:
- ...

Existing features verified:
- ...

Tests:
- ...

Potential issues:
- ...
```

不要只回覆：

```text
Done
```

---

# 26. Highest Priority Rules

如果不同規則互相衝突，以以下順序處理：

```text
1. Preserve existing functionality
2. Follow explicit user request
3. Avoid unrelated changes
4. Keep architecture modular
5. Improve code quality
```

---

# 27. Golden Rule

每次修改前問自己：

> 「這個修改是否可能讓原本已存在的功能消失？」

如果答案是：

```text
可能
```

先分析 dependency，再修改。

如果無法確認：

**不要自行猜測。**

---

# Current Development Strategy

目前專案採用：

```text
Architecture First
↓
Core Stabilization
↓
System Separation
↓
Testing
↓
Feature Development
↓
Performance Optimization
```

目前優先整理：

```text
P0
Core
GameState
Player
Weapon
Projectile
Combat
Inventory
Loot
Container
GameSimulation
```

完成核心架構後，再進行：

```text
P1
UI
Input
Rendering
```

再進行：

```text
P2
Networking
Server
State Synchronization
```

最後：

```text
P3
Performance
Optimization
```

**不要自行跳階段。**

---

# Final Instruction

AI Agent 必須把本文件視為本 repository 長期開發規範。

**不要因為新增一個功能，就重寫另一個已存在系統。**

**不要因為重構一個系統，就刪除另一個系統原本提供的功能。**

**先理解，再修改。**

**小步修改，小步驗證。**

**功能完整性優先於程式碼漂亮程度。**
