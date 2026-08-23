<?
echo $form->create(null, array('action' => 'spam'));
echo $form->input("Message.subject");
echo $form->input("Message.body");
echo $form->end("Send");
?>
