import { Driver } from './driver'
import * as V from './validator'

export function newVendor(driver: Driver): Connex.Vendor {
    const poller = newOwnedAddressesPoller(driver)
    return {
        sign: (kind: 'tx' | 'cert') => {
            if (kind === 'tx') {
                return newTxSigningService(driver) as any
            } else if (kind === 'cert') {
                return newCertSigningService(driver) as any
            } else {
                throw new V.BadParameter('unsupported message kind')
            }
        },
        owned: (addr) => {
            V.ensure(V.isAddress(addr), 'expected address type')
            return poller.addresses
                .findIndex(a => a.toLowerCase() === addr.toLowerCase()) >= 0
        }
    }
}

function newOwnedAddressesPoller(driver: Driver) {
    let addresses = [] as string[]
    (async () => {
        for (; ;) {
            try {
                addresses = await driver.pollOwnedAddresses()
                // tslint:disable-next-line:no-empty
            } catch {
            }
        }
    })()

    return {
        get addresses() { return addresses }
    }
}

function newTxSigningService(driver: Driver): Connex.Vendor.TxSigningService {
    const opts: {
        signer?: string
        gas?: number
        dependsOn?: string
        link?: string
        comment?: string
    } = {}
    return {
        signer(addr) {
            V.ensure(V.isAddress(addr), `'signer' expected address type`)
            opts.signer = addr
            return this
        },
        gas(gas) {
            V.ensure(gas >= 0 && Number.isSafeInteger(gas), `'gas' expected non-neg safe integer`)
            opts.gas = gas
            return this
        },
        dependsOn(txid) {
            V.ensure(V.isBytes32(txid), `'dependsOn' expected bytes32 in hex string`)
            opts.dependsOn = txid
            return this
        },
        link(url) {
            V.ensure(typeof url === 'string', `'link' expected string`)
            opts.link = url
            return this
        },
        comment(text) {
            V.ensure(typeof text === 'string', `'comment' expected string`)
            opts.comment = text
            return this
        },
        request(msg) {
            V.ensure(Array.isArray(msg), 'expected array')
            msg = msg.map((c, i) => {
                c = { ...c }
                c.to = c.to || null
                c.value = c.value || 0
                c.data = c.data || '0x'
                c.comment = c.comment || ''

                V.ensure(!c.to || V.isAddress(c.to), `'#${i}.to' expected null or address type`)
                V.ensure(typeof c.value === 'string' ?
                    (/^0x[0-9a-f]+$/i.test(c.value) || /^[1-9][0-9]+$/.test(c.value))
                    : Number.isSafeInteger(c.value),
                    `'#${i}.value' expected non-negative safe integer or integer in hex|dec string`)
                V.ensure(/^0x([0-9a-f][0-9a-f])*$/i.test(c.data),
                    `'#${i}.data' expected bytes in hex`)
                V.ensure(typeof c.comment === 'string', `'#${i}.comment' expected string`)
                return c
            })

            return (async () => {
                try {
                    const r = await driver.signTx(msg, opts)
                    return await r.doSign()
                } catch (err) {
                    throw new Rejected(err.message)
                }
            })()
        }
    }
}

function newCertSigningService(driver: Driver): Connex.Vendor.CertSigningService {
    const opts: {
        signer?: string
        link?: string
    } = {}

    return {
        signer(addr) {
            V.ensure(V.isAddress(addr), `'signer' expected address type`)
            opts.signer = addr
            return this
        },
        link(url) {
            V.ensure(typeof url === 'string', `'link' expected string`)
            opts.link = url
            return this
        },
        request(msg) {
            V.ensure(typeof msg === 'object', 'expected object')
            V.ensure(msg.purpose === 'agreement' || msg.purpose === 'identification',
                `'purpose' expected 'agreement' or 'identification'`)
            V.ensure(typeof msg.payload === 'object', `'payload' expected object`)
            V.ensure(msg.payload.type === 'text', `'payload.type' unsupported`)
            V.ensure(typeof msg.payload.content === 'string', `'payload.content' expected string`)

            return (async () => {
                try {
                    return await driver.signCert(msg, opts)
                } catch (err) {
                    throw new Rejected(err.message)
                }
            })()
        }
    }
}

class Rejected extends Error {
    constructor(msg: string) {
        super(msg)
        this.name = Rejected.name
    }
}