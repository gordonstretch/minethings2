<?

echo $form->create(null, array('action'=>'add/'.$itemId) );
echo $form->input("item_id", array('type'=>'hidden', 'value'=>$itemId));
echo $form->input('attribute');
echo $form->input('operand');
echo $form->input('value');
echo $form->end("Save");

?>