import { abi } from '@vechain/abi'
import { newFilter } from './filter'
import * as V from './validator'

export function newEventVisitor(
    ctx: Context,
    addr: string,
    coder: abi.Event
): Connex.Thor.EventVisitor {

    const encode = (indexed: object) => {
        const topics = coder.encode(indexed)
        return {
            address: addr,
            topic0: topics[0] || undefined,
            topic1: topics[1] || undefined,
            topic2: topics[2] || undefined,
            topic3: topics[3] || undefined,
            topic4: topics[4] || undefined
        }
    }

    return {
        asCriteria: indexed => {
            try {
                return encode(indexed)
            } catch (err) {
                throw new V.BadParameter(`arg0 can not be encoded: ${err.message}`)
            }
        },
        filter: (indexed) => {
            V.ensure(Array.isArray(indexed), 'arg0 expected array')

            if (indexed.length === 0) {
                indexed = [{}]
            }

            const criteriaSet = indexed.map((o, i) => {
                try {
                    return encode(o)
                } catch (err) {
                    throw new V.BadParameter(`arg0.#${i} can not be encoded: ${err.message}`)
                }
            })
            const filter = newFilter(ctx, 'event').criteria(criteriaSet)
            return {
                criteria(set) {
                    filter.criteria(set)
                    return this
                },
                range(range: Connex.Thor.Filter.Range) {
                    filter.range(range)
                    return this
                },
                order(order) {
                    filter.order(order)
                    return this
                },
                apply(offset: number, limit: number) {
                    return filter.apply(offset, limit)
                        .then(events => events.map(event => {
                            const decoded = coder.decode(event.data, event.topics)
                            return { ...event, decoded }
                        }))
                }
            }
        }
    }
}
