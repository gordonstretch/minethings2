<?

echo $form->create(null, array('action' => 'update_global_message'));
echo $form->input('MinethingsGlobal.id', array('type' => 'hidden', 'value' => $minethingsGlobalId));
echo $form->input('MinethingsGlobal.message', array('type' => 'textarea'));
echo $form->end('submit');

?>
