import {action, autorun, computed, observable} from 'mobx';
import axios from 'axios';

import {base58Decode} from '@waves/ts-lib-crypto';
import {IAsset} from '@stores/KeeperStore';
import {checkSlash, INetwork, Network} from '@utils';
import {RootStore} from '@stores/RootStore';
import { ELoginType } from '@src/interface';

import {SubStore} from './SubStore';

class AccountStore extends SubStore {
    @observable assets: { [name: string]: IAsset } = {'TN': {name: 'TN', assetId: 'TN', decimals: 8}};
    @observable scripted = false;
    @observable network: INetwork | null = null;
    @observable address: string | null = null;
    @observable loginType: ELoginType | null = null;

    constructor(rootStore: RootStore) {
        super(rootStore);
        autorun(async () => this.address && await this.updateAccountAssets(this.address));
    }

    @computed get isAuthorized() {
        return this.rootStore.keeperStore.isApplicationAuthorizedInWavesKeeper ||
            this.rootStore.signerStore.isApplicationAuthorizedInWavesExchange;
    }

    @computed get fee() {
        return this.scripted ? '0.1' : '0.06';
    }

    @action
    async updateAccountAssets(address: string) {
        if (!this.network) return;
        const server = this.network.server;
        const path = `${checkSlash(server)}assets/balance/${address}`;
        const resp = await fetch(path);
        const data = (await (resp).json());

        const nftResp = await fetch(`${checkSlash(server)}assets/nft/${address}/limit/1000`);
        const nft: { 'assetId': 'string', 'name': 'string', 'decimals': 0 }[] = (await (nftResp).json());

        const assets: { balances: { assetId: string, issueTransaction: { name: string, decimals: number } }[] } = data;

        assets.balances = [
            ...assets.balances,
            ...nft.map(({assetId, name, decimals}) => ({
                assetId: assetId,
                issueTransaction: {name, decimals}
            }))
        ];

        const ids: any = assets.balances.filter(balance => balance.issueTransaction === null).map(x => x.assetId);
        if (ids.length !== 0) {
            const assetDetails = await axios.post('/assets/details', {ids}, {baseURL: `${checkSlash(server)}`});

            assetDetails.data.forEach((assetDetails: any) => {
                assets.balances
                    .filter(x => x.assetId === assetDetails.assetId)
                    .forEach(x => {
                        x.issueTransaction = {
                            name: assetDetails.name,
                            decimals: assetDetails.decimals
                        };
                    });
            });
        }

        if ('balances' in assets && !assets.balances.some(x => x.issueTransaction === null)) {
            this.rootStore.accountStore.assets = {
                'TN': {name: 'TN', assetId: 'TN', decimals: 8},
                ...assets.balances.reduce((acc, {assetId, issueTransaction: {name, decimals}}) =>
                    ({...acc, [assetId]: {assetId, name, decimals}}), {}),
            }
        }
    }

    getNetworkByAddress = (address: string): INetwork | null => {
        const byte = base58Decode(address)[1];

        try {
            const network = Network.getNetworkByByte(byte);

            return network ? network : null;
        } catch (e) {
            this.rootStore.notificationStore.notify(e.message, {type: 'error'});
        }
        return null;
    };

}

export default AccountStore;
