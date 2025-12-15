import { Vault, Wallet, User, Policy, DelegatedAccess } from '@/types';

// In-memory storage for POC
class Store {
  private vaults: Map<string, Vault> = new Map();
  private wallets: Map<string, Wallet> = new Map();
  private users: Map<string, User> = new Map();
  private policies: Map<string, Policy> = new Map();
  private delegatedAccesses: Map<string, DelegatedAccess> = new Map();

  // Vault operations
  createVault(vault: Vault): Vault {
    this.vaults.set(vault.id, vault);
    return vault;
  }

  getVault(id: string): Vault | undefined {
    return this.vaults.get(id);
  }

  getAllVaults(): Vault[] {
    return Array.from(this.vaults.values());
  }

  getVaultsByAdminEmail(email: string): Vault[] {
    return Array.from(this.vaults.values()).filter(v => v.adminEmail === email);
  }

  updateVault(id: string, updates: Partial<Vault>): Vault | undefined {
    const vault = this.vaults.get(id);
    if (!vault) return undefined;
    const updated = { ...vault, ...updates };
    this.vaults.set(id, updated);
    return updated;
  }

  // Wallet operations
  createWallet(wallet: Wallet): Wallet {
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  getWallet(id: string): Wallet | undefined {
    return this.wallets.get(id);
  }

  getWalletsByVaultId(vaultId: string): Wallet[] {
    return Array.from(this.wallets.values()).filter(w => w.vaultId === vaultId);
  }

  getWalletsByEmail(email: string): Wallet[] {
    return Array.from(this.wallets.values()).filter(
      w => w.associatedEmail === email || w.userEmail === email || w.userIdentifier === email
    );
  }

  updateWallet(id: string, updates: Partial<Wallet>): Wallet | undefined {
    const wallet = this.wallets.get(id);
    if (!wallet) return undefined;
    const updated = { ...wallet, ...updates };
    this.wallets.set(id, updated);
    return updated;
  }

  getAllWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }

  // User operations
  createUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  // Policy operations
  createPolicy(policy: Policy): Policy {
    this.policies.set(policy.id, policy);
    return policy;
  }

  getPolicy(id: string): Policy | undefined {
    return this.policies.get(id);
  }

  getPoliciesByTarget(targetType: 'wallet' | 'vault', targetId: string): Policy[] {
    return Array.from(this.policies.values()).filter(
      p => p.targetType === targetType && p.targetId === targetId
    );
  }

  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  // Delegated Access operations
  createDelegatedAccess(delegatedAccess: DelegatedAccess): DelegatedAccess {
    this.delegatedAccesses.set(delegatedAccess.id, delegatedAccess);
    return delegatedAccess;
  }

  getDelegatedAccess(id: string): DelegatedAccess | undefined {
    return this.delegatedAccesses.get(id);
  }

  getDelegatedAccessesByVaultId(vaultId: string): DelegatedAccess[] {
    return Array.from(this.delegatedAccesses.values()).filter(
      da => da.vaultId === vaultId && da.status === 'active'
    );
  }

  getDelegatedAccessesByWalletId(walletId: string): DelegatedAccess[] {
    return Array.from(this.delegatedAccesses.values()).filter(
      da => da.walletId === walletId && da.status === 'active'
    );
  }

  getDelegatedAccessesByDelegateEmail(delegateEmail: string): DelegatedAccess[] {
    return Array.from(this.delegatedAccesses.values()).filter(
      da => da.delegateEmail === delegateEmail && da.status === 'active'
    );
  }

  getAllDelegatedAccesses(): DelegatedAccess[] {
    return Array.from(this.delegatedAccesses.values());
  }

  updateDelegatedAccess(id: string, updates: Partial<DelegatedAccess>): DelegatedAccess | undefined {
    const delegatedAccess = this.delegatedAccesses.get(id);
    if (!delegatedAccess) return undefined;
    const updated = { ...delegatedAccess, ...updates };
    this.delegatedAccesses.set(id, updated);
    return updated;
  }

  // Check if delegation already exists (for idempotency)
  getDelegatedAccessByEventId(eventId: string): DelegatedAccess | undefined {
    return Array.from(this.delegatedAccesses.values()).find(
      da => da.eventId === eventId
    );
  }
}

// Singleton instance
export const store = new Store();

