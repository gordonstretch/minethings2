<?

echo $form->create('Meld', array('action' => 'add/'.$mineTypeId) );
echo $form->input('mine_type_id', array('type'=>'hidden', 'value'=>$mineTypeId) );
echo $form->input('name');
echo $form->end();

?>