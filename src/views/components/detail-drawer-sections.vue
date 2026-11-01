<template>
  <div class="pmis-detail-drawer-sections min-w-0" :class="{ 'space-y-4': !tabbed }">
    <SectionTabs />
  </div>
</template>

<script setup lang="tsx">
  import { Comment, Text, ref, useSlots } from 'vue'
  import { ElTabs, ElTabPane } from 'element-plus'

  const props = withDefaults(defineProps<{ tabbed?: boolean }>(), { tabbed: true })
  const slots = useSlots()
  const activeTab = ref('0')
  const SectionTabs = () => {
    const sections = (slots.default?.() ?? []).filter(
      (section) => section.type !== Comment && section.type !== Text
    )
    if (!props.tabbed || sections.length < 2) return sections
    return (
      <ElTabs v-model={activeTab.value}>
        {sections.map((section, index) => (
          <ElTabPane
            name={String(index)}
            label={String(section.props?.title ?? '详情')}
            lazy={false}
          >
            {section}
          </ElTabPane>
        ))}
      </ElTabs>
    )
  }
</script>
